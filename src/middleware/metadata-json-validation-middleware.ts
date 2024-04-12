/**
 * Validator for `meta` tag that yields json validation
 *
 */

import { NextFunction, Request, Response } from "express";
import { InputException } from "../exceptions/http/http-exceptions";
import Ajv, { ErrorObject } from "ajv";
import metaschema from "../../schema/metadata.schema.json";
import { add } from "date-fns";

const ajv = new Ajv({ allErrors: true });

export async function metajsonValidator(req: Request, res: Response, next: NextFunction) {
    const validate = ajv.compile(metaschema);

    try {
        let metadataFile = (req.body.files as any)['metadata'];
        if (!metadataFile) {
            throw new InputException("metadata file input missing");
        }

        const metadata = JSON.parse(metadataFile[0].buffer);
        const valid = validate(metadata);
        if (!valid) {
            let requiredMsg = validate.errors?.filter(z => z.keyword == "required").map((error: ErrorObject) => `${error.params.missingProperty}`).join(", ");
            let additionalMsg = validate.errors?.filter(z => z.keyword == "additionalProperties").map((error: ErrorObject) => `${error.params.additionalProperty}`).join(", ");
            requiredMsg = requiredMsg != "" ? "Required properties : " + requiredMsg + " are missing" : "";
            additionalMsg = additionalMsg != "" ? "Additional properties found : " + additionalMsg + " is/are not allowed" : "";
            console.error("Metadata json validation error : ", additionalMsg, requiredMsg);
            next(new InputException((requiredMsg + " \n " + additionalMsg) as string));
        }
        else
            next();
    }
    catch (error) {
        if (error instanceof SyntaxError) {
            console.error("Metadata json parse error");
            next(new InputException(error.message));
        }
        else {
            console.error('metajsonValidator middleware error');
            next(new InputException("metadata file input missing"));
        }
    }
}