/**
 * Validator for `meta` tag that yields json validation
 *
 */

import { NextFunction, Request, Response } from "express";
import { InputException } from "../exceptions/http/http-exceptions";
import Ajv, { ErrorObject } from "ajv";
import metaschema from "../../schema/metadata.schema.json";

const ajv = new Ajv({ allErrors: true });
const validate = ajv.compile(metaschema);

export async function metajsonValidator(req: Request, res: Response, next: NextFunction) {

    try {
        let metadataFile = (req.files as any)['metadata'];
        if (!metadataFile) {
            throw new InputException("metadata file input upload missing");
        }

        const metadata = JSON.parse(metadataFile[0].buffer);
        const valid = validate(metadata);
        if (!valid) {
            const message = validate.errors?.map((error: ErrorObject) => error.instancePath.replace('/', "") + " " + error.message).join(", \n");
            console.error("Metadata json validation error : ", message);
            next(new InputException(message as string));
        }
        next();
    }
    catch (error) {
        if (error instanceof SyntaxError) {
            console.error("Metadata json parse error");
            next(new InputException(error.message));
        }
        else {
            console.error('metajsonValidator middleware error');
            next(new InputException("metadata file input upload missing"));
        }
    }
}