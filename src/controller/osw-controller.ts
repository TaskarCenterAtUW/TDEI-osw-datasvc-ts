import { NextFunction, Request } from "express";
import express from "express";
import { IController } from "./interface/IController";
import { OswQueryParams } from "../model/osw-get-query-params";
import { FileEntity } from "nodets-ms-core/lib/core/storage";
import oswService from "../service/Osw-service";
import HttpException from "../exceptions/http/http-base-exception";
import { DuplicateException } from "../exceptions/http/http-exceptions";
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
            var params: OswQueryParams = new OswQueryParams(JSON.parse(JSON.stringify(request.query)));
            const osw = await oswService.getAllOsw(params);
            response.send(osw);
        } catch (error) {
            console.error(error);
            next(new HttpException(500, "Error while fetching the osw information"));
        }
    }

    getOswById = async (request: Request, response: express.Response, next: NextFunction) => {

        try {
            let fileEntity: FileEntity = await oswService.getOswById(request.params.id);

            response.header('Content-Type', fileEntity.mimeType);
            response.header('Content-disposition', `attachment; filename=${fileEntity.fileName}`);
            response.status(200);
            (await fileEntity.getStream()).pipe(response);
        } catch (error: any) {
            console.error('Error while getting the file stream');
            console.error(error);
            if (error instanceof HttpException)
                throw next(error);
            next(new HttpException(500, "Error while getting the file stream"));
        }
    }

    createOsw = async (request: Request, response: express.Response, next: NextFunction) => {
        try {
            let pathways = OswVersions.from(request.body);

            validate(pathways).then(async errors => {
                // errors is an array of validation errors
                if (errors.length > 0) {
                    console.error('Upload pathways osw metadata information failed validation. errors: ', errors);
                    const message = errors.map((error: ValidationError) => Object.values(<any>error.constraints)).join(', ');
                    next(new HttpException(500, 'Input validation failed with below reasons : \n' + message));
                } else {
                    var newOsw = await oswService.createOsw(pathways)
                        .catch((error: any) => {
                            if (error instanceof DuplicateException) {
                                throw error;
                            }
                            next(new HttpException(500, 'Error saving the osw version'));
                        });
                    response.send(newOsw);
                }
            });
        } catch (error) {
            console.error('Error saving the osw version');
            console.error(error);
            next(error);
        }
    }
}

const oswController = new GtfsOSWController();
export default oswController;