/**
 * Middleware to handle the token authorization etc.
 */

import { Request, Response, NextFunction } from 'express';
import { ForbiddenAccess, UnAuthenticated } from '../exceptions/http/http-exceptions';
import HttpException from '../exceptions/http/http-base-exception';
import tdeiCoreService from '../service/tdei-core-service';
import { Utility } from '../utility/utility';
import { th } from 'date-fns/locale';

/**
 * Authorizes the request with provided allowed roles and tdei_project_group_id
 * the user id is available as `req.user_id`
 * @param req - Initial request
 * @param res  - Supposed response (to be filled by others)
 * @param next - Next function
 */
export const authorize = (approvedRoles: string[]) => {
    return async (req: Request, res: Response, next: NextFunction) => {
        try {
            console.log("authorize middleware");
            // Get the authorization key
            const bearerHeader = req.headers.authorization;
            if (bearerHeader === '' || bearerHeader === undefined)
                return next(new ForbiddenAccess());

            let apiKey = req.headers['x-api-key'];
            //Reject authorization for API key users
            if (apiKey && apiKey !== '') {
                return next(new ForbiddenAccess());
            }

            if (!req.body.user_id)
                return next(new UnAuthenticated());

            if (req.params["project_id"]) {
                req.body.tdei_project_group_id = req.params["project_id"];
                await tdeiCoreService.checkProjectGroupExistsById(req.params["project_id"])
            }
            else if (req.params["tdei_project_group_id"]) {
                req.body.tdei_project_group_id = req.params["tdei_project_group_id"];
                await tdeiCoreService.checkProjectGroupExistsById(req.params["tdei_project_group_id"])
            }
            else if (req.params["tdei_dataset_id"]) {
                //Fetch tdei_project_group_id from tdei_dataset_id
                let osw = await tdeiCoreService.getDatasetDetailsById(req.params["tdei_dataset_id"]);
                req.body.tdei_project_group_id = osw.tdei_project_group_id;
            }
            else {
                //Case when tdei_project_group_id is not provided/ cannot retrived from dataset_id and reason we cannot authorize the request
                console.error("authorize:tdei_project_group_id cannot be extracted");
                return next(new Error("authorize:tdei_project_group_id cannot be extracted"));
            }

            //If no roles skip the check
            if (!approvedRoles.length)
                return next();

            var authorized = await Utility.authorizeRoles(req.body.user_id, req.body.tdei_project_group_id, approvedRoles);
            if (authorized) {
                next();
            }
            else {
                next(new ForbiddenAccess());
            }
        } catch (error) {
            if (error instanceof HttpException) {
                return next(error);
            }
            return next(new HttpException(500, "Error processing the request"));
        }
    }
}