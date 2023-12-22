/**
 * Middleware to handle the token authorization etc.
 */

import { Request, Response, NextFunction } from 'express';
import { Core } from 'nodets-ms-core';
import { environment } from "../environment/environment";
import { PermissionRequest } from 'nodets-ms-core/lib/core/auth/model/permission_request';
import { UnAuthenticated } from '../exceptions/http/http-exceptions';
import oswService from '../service/Osw-service';

/**
 * Authorizes the request with provided allowed roles and tdei_project_group_id
 * the user id is available as `req.user_id`
 * @param req - Initial request
 * @param res  - Supposed response (to be filled by others)
 * @param next - Next function
 */
export const authorize = (approvedRoles: string[]) => {
    return async (req: Request, res: Response, next: NextFunction) => {

        if (!req.body.user_id)
            return next(new UnAuthenticated());

        if (req.params["tdei_record_id"]) {
            //Fetch tdei_project_group_id from tdei_record_id
            let osw = await oswService.getOSWRecordById(req.params["tdei_record_id"]);
            req.body.tdei_project_group_id = osw.tdei_project_group_id;
        }
        else if (req.params["tdei_project_group_id"]) {
            req.body.tdei_project_group_id = req.params["tdei_project_group_id"];
        }
        else {
            console.error("authorize:tdei_project_group_id cannot be extracted");
            return next(new Error("authorize:tdei_project_group_id cannot be extracted"));
        }

        //If no roles skip the check
        if (!approvedRoles.length)
            return next();

        const authProvider = Core.getAuthorizer({ provider: "Hosted", apiUrl: environment.authPermissionUrl });
        const permissionRequest = new PermissionRequest({
            userId: req.body.user_id as string,
            projectGroupId: req.body.projectGroupId,
            permssions: approvedRoles,
            shouldSatisfyAll: false
        });

        try {
            const response = await authProvider?.hasPermission(permissionRequest);
            if (response) {
                next();
            }
            else {
                next(new UnAuthenticated());
            }
        }
        catch (error) {
            next(new UnAuthenticated());
        }
    }
}