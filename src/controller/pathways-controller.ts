import { NextFunction, Request } from "express";
import express from "express";
import { IController } from "./interface/IController";
import HttpException from "../exceptions/http/http-base-exception";
import { InputException, FileTypeException } from "../exceptions/http/http-exceptions";
import { Versions } from "../model/versions-dto";
import { environment } from "../environment/environment";
import multer, { memoryStorage } from "multer";
import path from "path";
import { IUploadRequest } from "../service/interface/upload-request-interface";
import { metajsonValidator } from "../middleware/metadata-json-validation-middleware";
import { authorize } from "../middleware/authorize-middleware";
import { authenticate } from "../middleware/authenticate-middleware";
import pathwaysService from "../service/pathways-service";
/**
  * Multer for multiple uploads
  * Configured to pull to 'uploads' folder
  * and buffer is available with the request
  * File filter is added to ensure only files with .zip extension
  * are allowed
  */

const validate = multer({
    dest: 'validate/',
    storage: memoryStorage(),
    fileFilter: (req, file, cb) => {
        const allowedFileTypes = ['.zip'];
        const ext = path.extname(file.originalname);
        if (!allowedFileTypes.includes(ext)) {
            cb(new FileTypeException());
        }
        cb(null, true);
    }
});

const upload = multer({
    dest: 'uploads/',
    storage: memoryStorage(),
    fileFilter: (req, file, cb) => {
        let allowedFileTypes: string[] = [];
        if (file.fieldname === 'metadata') {
            allowedFileTypes = ['.json'];
        }
        else if (file.fieldname === 'dataset') {
            allowedFileTypes = ['.zip'];
        }
        else if (file.fieldname === 'changeset') {
            allowedFileTypes = ['.zip', '.osc'];
        }
        const ext = path.extname(file.originalname);
        if (!allowedFileTypes.includes(ext)) {
            cb(new HttpException(400, `Invalid file format for ${file.fieldname} , allowed formats are ${allowedFileTypes.join(", ")}`));
        }
        cb(null, true);
    }
});

class PathwaysController implements IController {
    public path = '/api/v1/gtfs-pathways';
    public router = express.Router();
    constructor() {
        this.intializeRoutes();
    }

    public intializeRoutes() {
        this.router.get(`${this.path}/:id`, authenticate, this.getPathwaysById);
        this.router.post(`${this.path}/validate`, validate.single('dataset'), authenticate, this.processValidationOnlyRequest);
        this.router.post(`${this.path}/upload/:tdei_project_group_id/:tdei_service_id`, upload.fields([
            { name: "dataset", maxCount: 1 },
            { name: "metadata", maxCount: 1 },
            { name: "changeset", maxCount: 1 }
        ]), metajsonValidator, authenticate, authorize(["tdei_admin", "poc", "pathways_data_generator"]), this.processUploadRequest);
        this.router.post(`${this.path}/publish/:tdei_dataset_id`, authenticate, authorize(["tdei_admin", "poc", "pathways_data_generator"]), this.processPublishRequest);
        this.router.get(`${this.path}/versions/info`, authenticate, this.getVersions);
    }

    getVersions = async (request: Request, response: express.Response, next: NextFunction) => {
        let versionsList = new Versions([{
            documentation: environment.gatewayUrl as string,
            specification: "https://gtfs.org/schedule/examples/pathways/",
            version: "v1.0"
        }]);

        response.status(200).send(versionsList);
    }

    /**
     * Given the tdei_dataset_id api downloads the zip file containing pathways files.
     * @param request 
     * @param response 
     * @param next 
     * @returns 
     */
    getPathwaysById = async (request: Request, response: express.Response, next: NextFunction) => {

        try {
            const sasUrl = await pathwaysService.getPathwaysDownloadUrl(request.params.id);
            response.redirect(sasUrl);

        } catch (error: any) {
            console.error('Error while getting the file download URL');
            console.error(error);
            if (error instanceof HttpException) {
                response.status(error.status).send(error.message);
                return next(error);
            }
            response.status(500).send("Error while getting download URL");
            next(new HttpException(500, "Error while getting download URL for dataset"));
        }

    }

    /**
    * Processes the validation only request 
    * @param request 
    * @param response 
    * @param next 
    * @returns 
    */
    processValidationOnlyRequest = async (request: Request, response: express.Response, next: NextFunction) => {
        try {
            console.log('Received validation request');
            // let datasetFile = (request.files as any)['dataset'];
            const datasetFile = request.file;
            if (!datasetFile) {
                console.error("dataset file input missing");
                response.status(400).send("dataset file input missing");
                next(new InputException("dataset file input missing"));
            }

            let job_id = await pathwaysService.processValidationOnlyRequest(request.body.user_id, datasetFile);
            response.setHeader('Location', `/api/v1/job?job_id=${job_id}`);
            return response.status(202).send(job_id);

        } catch (error) {
            console.error("Error while processing the validation request", error);
            if (error instanceof HttpException) {
                response.status(error.status).send(error.message);
                return next(error);
            }
            response.status(500).send("Error while processing the validation request");
            next(new HttpException(500, "Error while processing the validation request"));
        }
    }

    /**
    * Publishes the tdei record 
    * @param request 
    * @param response 
    * @param next 
    * @returns 
    */
    processPublishRequest = async (request: Request, response: express.Response, next: NextFunction) => {
        try {
            let tdei_dataset_id = request.params["tdei_dataset_id"];
            let job_id = await pathwaysService.processPublishRequest(request.body.user_id, tdei_dataset_id);

            response.setHeader('Location', `/api/v1/job?job_id=${job_id}`);
            return response.status(202).send(job_id);

        } catch (error) {
            console.error("Error while processing the publish request", error);
            if (error instanceof HttpException) {
                response.status(error.status).send(error.message);
                return next(error);
            }
            response.status(500).send("Error while processing the publish request");
            next(new HttpException(500, "Error while processing the publish request"));
        }
    }

    /**
     * Function to create record in the database and upload the gtfs-pathways files
     * @param request 
     * @param response 
     * @param next 
     * @returns 
     */
    processUploadRequest = async (request: Request, response: express.Response, next: NextFunction) => {
        try {
            console.log('Received upload request');
            let uploadRequest: IUploadRequest = {
                user_id: request.body.user_id,
                tdei_project_group_id: request.params["tdei_project_group_id"],
                tdei_service_id: request.params['tdei_service_id'],
                derived_from_dataset_id: request.query?.derived_from_dataset_id ? request.query?.derived_from_dataset_id as string : "",
                datasetFile: (request.files as any)['dataset'],
                metadataFile: (request.files as any)['metadata'],
                changesetFile: (request.files as any)['changeset']
            }

            if (!uploadRequest.datasetFile) {
                console.error("dataset file input upload missing");
                response.status(400).send("dataset file input upload missing");
                return next(new InputException("dataset file input upload missing"));
            }
            if (!uploadRequest.metadataFile) {
                console.error("metadata file input upload missing");
                response.status(400).send("metadata file input upload missing");
                return next(new InputException("metadata file input upload missing"));
            }

            let job_id = await pathwaysService.processUploadRequest(uploadRequest);
            response.setHeader('Location', `/api/v1/job?job_id=${job_id}`);
            return response.status(202).send(job_id);

        } catch (error) {
            console.error("Error while processing the upload request", error);
            if (error instanceof HttpException) {
                response.status(error.status).send(error.message);
                return next(error);
            }
            response.status(500).send("Error while processing the upload request");
            next(new HttpException(500, "Error while processing the upload request"));
        }
    }
}

const pathwaysController = new PathwaysController();
export default pathwaysController;