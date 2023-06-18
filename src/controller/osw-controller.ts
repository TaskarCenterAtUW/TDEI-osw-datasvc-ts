import { NextFunction, Request } from "express";
import express from "express";
import { IController } from "./interface/IController";
import { OswQueryParams } from "../model/osw-get-query-params";
import { FileEntity } from "nodets-ms-core/lib/core/storage";
import oswService from "../service/Osw-service";
import HttpException from "../exceptions/http/http-base-exception";
import { DuplicateException, InputException } from "../exceptions/http/http-exceptions";
import { OswVersions } from "../database/entity/osw-version-entity";
import { validate, ValidationError } from "class-validator";

class GtfsOSWController implements IController {
    public path = '/api/v1/osw';
    public router = express.Router();
    constructor() {
        this.intializeRoutes();
    }

    public intializeRoutes() {
        this.router.get(this.path, this.getAllOsw);
        this.router.get(`${this.path}/:id`, this.getOswById);
        this.router.post(this.path, this.createOsw);
    }

    getAllOsw = async (request: Request, response: express.Response, next: NextFunction) => {
        try {
            let params: OswQueryParams = new OswQueryParams(JSON.parse(JSON.stringify(request.query)));
            const osw = await oswService.getAllOsw(params);
            response.status(200).send(osw);
        } catch (error) {
            console.error(error);
            if (error instanceof InputException) {
                response.status(error.status).send(error.message);
                next(error);
            }
            else {
                response.status(500).send("Error while fetching the osw information");
                next(new HttpException(500, "Error while fetching the osw information"));
            }
        }
    }

    getOswById = async (request: Request, response: express.Response, next: NextFunction) => {

        try {
            const fileEntity: FileEntity = await oswService.getOswById(request.params.id);

            response.header('Content-Type', fileEntity.mimeType);
            response.header('Content-disposition', `attachment; filename=${fileEntity.fileName}`);
            response.status(200);
            (await fileEntity.getStream()).pipe(response);
        } catch (error: any) {
            console.error('Error while getting the file stream');
            console.error(error);
            if (error instanceof HttpException) {
                response.status(error.status).send(error.message);
                return next(error);
            }
            response.status(500).send("Error while getting the file stream");
            next(new HttpException(500, "Error while getting the file stream"));
        }
    }

    createOsw = async (request: Request, response: express.Response, next: NextFunction) => {
        try {
            const osw = OswVersions.from(request.body);

            return validate(osw).then(async errors => {
                // errors is an array of validation errors
                if (errors.length > 0) {
                    console.error('osw metadata information failed validation. errors: ', errors);
                    const message = errors.map((error: ValidationError) => Object.values(<any>error.constraints)).join(', ');
                    response.status(400).send('Input validation failed with below reasons : \n' + message)
                    next(new HttpException(400, 'Input validation failed with below reasons : \n' + message));
                } else {
                    return await oswService.createOsw(osw)
                        .then(newOsw => {
                            return Promise.resolve(response.status(200).send(newOsw));
                        })
                        .catch((error: any) => {
                            if (error instanceof DuplicateException) {
                                response.status(error.status).send(error.message)
                                next(new HttpException(error.status, error.message));
                            }
                            else {
                                response.status(500).send('Error saving the osw version')
                                next(new HttpException(500, 'Error saving the osw version'));
                            }
                        });
                }
            });
        } catch (error) {
            console.error('Error saving the osw version', error);
            response.status(500).send('Error saving the osw version')
            next(new HttpException(500, "Error saving the osw version"));
        }
    }
}

const oswController = new GtfsOSWController();
export default oswController;