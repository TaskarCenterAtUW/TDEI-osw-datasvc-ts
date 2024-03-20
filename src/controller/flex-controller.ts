import { NextFunction, Request } from "express";
import express from "express";
import { IController } from "./interface/IController";
import { FileEntity } from "nodets-ms-core/lib/core/storage";
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
import archiver from 'archiver';
import { FileEntityStream } from "../utility/utility";
import tdeiCoreService from "../service/tdei-core-service";
import { DatasetQueryParams } from "../model/dataset-get-query-params";
import { TDEIDataType } from "../model/jobs-get-query-params";
import flexService from "../service/flex-service";
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
        const allowedFileTypes = ['.zip', '.txt', '.json'];
        const ext = path.extname(file.originalname);
        if (!allowedFileTypes.includes(ext)) {
            cb(new FileTypeException());
        }
        cb(null, true);
    }
});

class FlexController implements IController {
    public path = '/api/v1/flex';
    public router = express.Router();
    constructor() {
        this.intializeRoutes();
    }

    public intializeRoutes() {
        this.router.get(`${this.path}/:id`, this.getFlexById);
        this.router.post(`${this.path}/validate`, validate.single('dataset'), authenticate, this.processValidationOnlyRequest);
        this.router.post(`${this.path}/upload/:tdei_project_group_id/:tdei_service_id`, upload.fields([
            { name: "dataset", maxCount: 1 },
            { name: "metadata", maxCount: 1 },
            { name: "changeset", maxCount: 1 }
        ]), metajsonValidator, authenticate, authorize(["tdei_admin", "poc", "flex_data_generator"]), this.processUploadRequest);
        this.router.post(`${this.path}/publish/:tdei_dataset_id`, authenticate, authorize(["tdei_admin", "poc", "flex_data_generator"]), this.processPublishRequest);
        this.router.get(`${this.path}/versions/info`, authenticate, this.getVersions);
        this.router.get(`${this.path}/`, authenticate, this.getDatasetList);
    }

    /**
   * Gets the list of Dataset versions
   * @param request 
   * @param response 
   * @param next 
   */
    getDatasetList = async (request: Request, response: express.Response, next: NextFunction) => {
        try {
            const params: DatasetQueryParams = new DatasetQueryParams(JSON.parse(JSON.stringify(request.query)));
            params.isAdmin = request.body.isAdmin;
            params.data_type = TDEIDataType.flex;
            const dataset = await tdeiCoreService.getDatasets(request.body.user_id, params);
            dataset.forEach(x => {
                x.download_url = `${this.path}/${x.tdei_dataset_id}`;
            });
            response.status(200).send(dataset);
        } catch (error) {
            console.error(error);
            if (error instanceof InputException) {
                response.status(error.status).send(error.message);
                next(error);
            }
            else {
                response.status(500).send("Error while fetching the dataset information");
                next(new HttpException(500, "Error while fetching the dataset information"));
            }
        }
    }

    getVersions = async (request: Request, response: express.Response, next: NextFunction) => {
        let versionsList = new Versions([{
            documentation: environment.gatewayUrl as string,
            specification: "https://github.com/OpenSidewalks/OpenSidewalks-Schema",
            version: "v0.1"
        }]);

        response.status(200).send(versionsList);
    }

    /**
     * Given the tdei_dataset_id api downloads the zip file containing flex files.
     * @param request 
     * @param response 
     * @param next 
     * @returns 
     */
    getFlexById = async (request: Request, response: express.Response, next: NextFunction) => {

        try {
            const fileEntities: FileEntity[] = await flexService.getFlexStreamById(request.params.id);

            const zipFileName = 'flex.zip';

            // // Create a new zip archive
            const archive = archiver('zip', { zlib: { level: 9 } });
            response.setHeader('Content-Type', 'application/zip');
            response.setHeader('Content-Disposition', `attachment; filename=${zipFileName}`);
            archive.pipe(response);

            // // Add files to the zip archive
            for (const filee of fileEntities) {
                // Read into a stream
                const fileEntityReader = new FileEntityStream(filee)

                archive.append(fileEntityReader, { name: filee.fileName, store: true });
            }

            // // Finalize the archive and close the zip stream
            archive.finalize();

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

            let job_id = await flexService.processValidationOnlyRequest(request.body.user_id, datasetFile);
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
            let job_id = await flexService.processPublishRequest(request.body.user_id, tdei_dataset_id);

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
     * Function to create record in the database and upload the gtfs-flex files
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

            let job_id = await flexService.processUploadRequest(uploadRequest);
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

const flexController = new FlexController();
export default flexController;