/**
 * Middleware to handle the token authorization etc.
 */

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { Core } from 'nodets-ms-core';
import { environment } from "../environment/environment";
import { PermissionRequest } from 'nodets-ms-core/lib/core/auth/model/permission_request';
import { UnAuthenticated } from '../exceptions/http/http-exceptions';

/**
 * Validates the token and sends the user_id in the req.body
 * the user id is available as `req.user_id`
 * @param req - Initial request
 * @param res  - Supposed response (to be filled by others)
 * @param next - Next function
 */
export async function tokenValidator(req: Request, res: Response, next: NextFunction) {

    const approvedRoles = ["tdei_admin", "poc", "osw_data_generator"]; // Change it based on service

    // Get the authorization key
    const bearerHeader = req.headers.authorization;
    if (bearerHeader === '' || bearerHeader === undefined) {
        // res.status(401).send('Unauthorized');
        next(new UnAuthenticated());
    }
    else {
        // Get the bearer
        const bearer = bearerHeader!.replace(/^Bearer\s/, '');
        if (bearer === '' || bearer === undefined) {
            next(new UnAuthenticated());
        }
        // Decode the token
        const jwtOutput = jwt.decode(bearer);
        if (jwtOutput == null) {
            next(new UnAuthenticated());
        }
        const user_id = jwtOutput?.sub;

        const meta = JSON.parse(req.body['meta']);
        const orgId = meta['tdei_org_id'];
        // Also check for the authorization of the user 
        // Needs to be authorized with tdeiOrgId, and should have any 
        // of the `osw_data_generator`, `poc`, `tdei_admin` 
        // this is to be done against the userID
        const authProvider = Core.getAuthorizer({ provider: "Hosted", apiUrl: environment.authPermissionUrl });
        const permissionRequest = new PermissionRequest({
            userId: user_id as string,
            orgId: orgId,
            permssions: approvedRoles,
            shouldSatisfyAll: false
        });

        try {
            const response = await authProvider?.hasPermission(permissionRequest);
            if (response) {
                req.body.user_id = user_id;
                next();
            }
            else {
                // res.send(401).send('Not Authorized');
                next(new UnAuthenticated());
            }
        }
        catch (error) {
            // res.send(401).send('Not Authorized');
            next(new UnAuthenticated());
        }



    }
}