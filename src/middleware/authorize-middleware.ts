/**
 * Middleware to handle the token authorization etc.
 */

import { Request, Response, NextFunction } from 'express';
import { UnAuthenticated } from '../exceptions/http/http-exceptions';
import HttpException from '../exceptions/http/http-base-exception';
import tdeiCoreService from '../service/tdei-core-service';
import { Utility } from '../utility/utility';

/**
 * Authorizes the request with provided allowed roles and tdei_project_group_id
 * the user id is available as `req.user_id`
 * @param req - Initial request
 * @param res  - Supposed response (to be filled by others)
 * @param next - Next function
 */
export const authorize = (approvedRoles: string[]) => {
    return async (req: Request, res: Response, next: NextFunction) => {
        console.log("authorize middleware");
        if (!req.body.user_id)
            return next(new UnAuthenticated());

        if (req.params["tdei_dataset_id"]) {
            //Fetch tdei_project_group_id from tdei_dataset_id
            try {
                let osw = await tdeiCoreService.getDatasetDetailsById(req.params["tdei_dataset_id"]);
                req.body.tdei_project_group_id = osw.tdei_project_group_id;
            } catch (error) {
                if (error instanceof HttpException) {
                    return next(error);
                }
                return next(new HttpException(500, "Error processing the request"));
            }
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

        var authorized = await Utility.authorizeRoles(req.body.user_id, req.body.tdei_project_group_id, approvedRoles);
        if (authorized) {
            next();
        }
        else {
            next(new UnAuthenticated());
        }
    }
}

