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
        let metadataFile = req.body["files"] != undefined as any ? (req.body.files as any)['metadata'] : (req.files as any)['metadata'];
        if (!metadataFile) {
            throw new InputException("metadata file input missing");
        }

        const metadata = JSON.parse(metadataFile[0].buffer);
        const valid = validate(metadata);
        if (!valid) {
            let requiredPropertyMsg = validate.errors?.filter(z => z.keyword == "required").map((error: ErrorObject) => `${error.instancePath.replace(/^\//, '').replace('/', ' -> ')} : ${error.params.missingProperty}`).join(`, \n`);
            let requiredEnumMsg = validate.errors?.filter(z => z.keyword == "enum").map((error: ErrorObject) => `${error.instancePath.replace(/^\//, '').replace('/', ' -> ')} : Allowed values ${error.params.allowedValues}`).join(`, \n`);
            let invalidTypeMsg = validate.errors?.filter(z => z.keyword == "type" && z.params.type != 'null').map((error: ErrorObject) => `${error.instancePath.replace(/^\//, '').replace('/', ' -> ')} : Must be of type ${error.params.type}`).join(`, \n`);
            let additionalMsg = validate.errors?.filter(z => z.keyword == "additionalProperties").map((error: ErrorObject) => `${error.params.additionalProperty}`).join(`, \n`);
            requiredPropertyMsg = requiredPropertyMsg != "" ? `\nMissing required properties : \n ${requiredPropertyMsg} ` : "";
            requiredEnumMsg = requiredEnumMsg != "" ? `\nInvalid property value : \n ${requiredEnumMsg} ` : "";
            invalidTypeMsg = invalidTypeMsg != "" ? `\nInvalid property type : \n ${invalidTypeMsg} ` : "";
            additionalMsg = additionalMsg != "" ? `\nAdditional properties found : \n ${additionalMsg} not allowed` : "";
            console.error("Metadata json validation error : \n", additionalMsg, requiredPropertyMsg, requiredEnumMsg, invalidTypeMsg);
            next(new InputException(("\n" + requiredPropertyMsg + "\n" + requiredEnumMsg + "\n" + invalidTypeMsg + "\n" + additionalMsg) as string));
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