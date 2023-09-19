/**
 * Validator for `meta` tag that yields json validation
 *
 */

import { NextFunction, Request, Response } from "express";
import { InputException } from "../exceptions/http/http-exceptions";

export async function metajsonValidator(req: Request, res: Response, next: NextFunction) {

    try {
        const meta = JSON.parse(req.body['meta']);
        next();
    }
    catch (error) {
        if (error instanceof SyntaxError){
            console.log("syntax error");
            next(new InputException(error.message));
        }
        else{
            console.log('Message');
            next(error);
        }
        
    }

}