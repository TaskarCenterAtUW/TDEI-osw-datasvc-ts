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

export const metajsonValidator = ((operation: string) => {
    return async (req: Request, res: Response, next: NextFunction) => {

        try {
            let metadataFile: any = undefined;
            let metadata = undefined;
            if (operation == 'dataset_upload') {
                metadataFile = req.body["files"] != undefined as any ? (req.body.files as any)['metadata'] : (req.files as any)['metadata'];
                if (metadataFile)
                    metadata = JSON.parse(metadataFile[0].buffer);
            } else if (operation == 'edit_metadata') {
                metadataFile = req.body["file"] != undefined as any ? (req.body.file as any) : (req.file as any);
                if (metadataFile)
                    metadata = JSON.parse(metadataFile.buffer);
            }

            if (!metadataFile) {
                return next(new InputException("metadata file input missing"));
            }

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
            else {

                let dataset_details: any = metadata.dataset_detail;
                let dataset_version = dataset_details.version;

                if (!/^\d+(\.\d+)?$/.test(dataset_version)) {
                    let error_message = `Metadata json validation error : \n Invalid property value : dataset_detail -> version, Dataset version must be a valid number in the format x or x.y (e.g. 1, 2.3)`;
                    console.error(error_message);
                    return next(new InputException(error_message));
                }
                else {
                    next();
                }
            }
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
});