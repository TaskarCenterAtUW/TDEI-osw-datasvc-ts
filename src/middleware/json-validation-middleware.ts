/**
 * Validator for `meta` tag that yields json validation
 *
 */

import { NextFunction, Request, Response } from "express";
import { InputException } from "../exceptions/http/http-exceptions";

export async function metajsonValidator(req: Request, res: Response, next: NextFunction) {

    try {
        let metadataFile = (req.files as any)['metadata'];
        if (!metadataFile) {
            throw new InputException("metadata file input upload missing");
        }

        const metadata = JSON.parse(metadataFile[0].buffer);
        next();
    }
    catch (error) {
        if (error instanceof SyntaxError) {
            console.log("Metadata json parse error");
            next(new InputException(error.message));
        }
        else {
            console.log('metajsonValidator middleware error');
            next(new InputException("metadata file input upload missing"));
        }
    }
}