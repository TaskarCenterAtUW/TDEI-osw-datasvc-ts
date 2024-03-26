import { NextFunction, Request } from "express";
import express from "express";
import { IController } from "./interface/IController";
import { FileEntity } from "nodets-ms-core/lib/core/storage";
import oswService from "../service/osw-service";
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
import { BboxServiceRequest, TagRoadServiceRequest } from "../model/backend-request-interface";
import tdeiCoreService from "../service/tdei-core-service";
import { DatasetQueryParams } from "../model/dataset-get-query-params";
import { TDEIDataType } from "../model/jobs-get-query-params";
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

const uploadForFormat = multer({
    dest: 'uploads/',
    storage: memoryStorage(),
    fileFilter: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        if (ext != '.zip' && ext != '.xml' && ext != '.osm') {
            cb(new FileTypeException());
        }
        cb(null, true);
    }
});

class OSWController implements IController {
    public path = '/api/v1/osw';
    public router = express.Router();
    constructor() {
        this.intializeRoutes();
    }

    public intializeRoutes() {
        this.router.get(`${this.path}/:id`, this.getOswById);
        this.router.post(`${this.path}/validate`, validate.single('dataset'), authenticate, this.processValidationOnlyRequest);
        this.router.post(`${this.path}/upload/:tdei_project_group_id/:tdei_service_id`, upload.fields([
            { name: "dataset", maxCount: 1 },
            { name: "metadata", maxCount: 1 },
            { name: "changeset", maxCount: 1 }
        ]), metajsonValidator, authenticate, authorize(["tdei_admin", "poc", "osw_data_generator"]), this.processUploadRequest);
        this.router.post(`${this.path}/publish/:tdei_dataset_id`, authenticate, authorize(["tdei_admin", "poc", "osw_data_generator"]), this.processPublishRequest);
        this.router.get(`${this.path}/versions/info`, authenticate, this.getVersions);
        this.router.post(`${this.path}/confidence/calculate/:tdei_dataset_id`, authenticate, authorize(["tdei_admin", "poc", "osw_data_generator"]), this.calculateConfidence); // Confidence calculation
        this.router.post(`${this.path}/convert`, uploadForFormat.single('file'), authenticate, this.createFormatRequest); // Format request
        this.router.post(`${this.path}/dataset-flatten/:tdei_dataset_id`, authenticate, authorize(["tdei_admin", "poc", "osw_data_generator"]), this.processFlatteningRequest);
        this.router.post(`${this.path}/dataset-bbox`, authenticate, this.processDatasetBboxRequest);
        this.router.post(`${this.path}/dataset-tag-road`, authenticate, this.processDatasetTagRoadRequest);
    }

    /**
 * Tags the sidewalk dataset with the 
 * @param request 
 * @param response 
 * @param next 
 * @returns 
 */
    processDatasetTagRoadRequest = async (request: Request, response: express.Response, next: NextFunction) => {
        try {

            const requestService = JSON.parse(JSON.stringify(request.query));
            if (!requestService) {
                return next(new InputException('request body is empty', response));
            }
            let backendRequest: TagRoadServiceRequest = {
                user_id: request.body.user_id,
                service: "dataset_tag_road",
                parameters: {
                    tdei_dataset_id: requestService.tdei_dataset_id
                }
            }

            let job_id = await oswService.processDatasetTagRoadRequest(backendRequest);
            response.setHeader('Location', `/api/v1/job?job_id=${job_id}`);
            return response.status(202).send(job_id);
        } catch (error) {
            console.error("Error while processing the dataset bbox request", error);
            if (error instanceof HttpException) {
                response.status(error.status).send(error.message);
                return next(error);
            }
            response.status(500).send("Error while processing the dataset bbox request");
            next(new HttpException(500, "Error while processing the dataset bbox request"));
        }
    }

    /**
     * Retrieves the list of versions.
     * 
     * @param request - The HTTP request object.
     * @param response - The HTTP response object.
     * @param next - The next middleware function.
     */
    getVersions = async (request: Request, response: express.Response, next: NextFunction) => {
        let versionsList = new Versions([{
            documentation: environment.gatewayUrl as string,
            specification: "https://github.com/OpenSidewalks/OpenSidewalks-Schema",
            version: "v0.1"
        }]);

        response.status(200).send(versionsList);
    }

    /**
     * Given the tdei_dataset_id api downloads the zip file containing osw files.
     * @param request 
     * @param response 
     * @param next 
     * @returns 
     */
    getOswById = async (request: Request, response: express.Response, next: NextFunction) => {

        try {
            let format = request.query.format as string ?? 'osw';

            const fileEntities: FileEntity[] = await oswService.getOswStreamById(request.params.id, format);

            const zipFileName = 'osw.zip';

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

            let job_id = await oswService.processValidationOnlyRequest(request.body.user_id, datasetFile);
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
            let job_id = await oswService.processPublishRequest(request.body.user_id, tdei_dataset_id);

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
    * Return the sidewalk dataset maching the bbox query 
    * @param request 
    * @param response 
    * @param next 
    * @returns 
    */
    processDatasetBboxRequest = async (request: Request, response: express.Response, next: NextFunction) => {
        try {

            const requestService = JSON.parse(JSON.stringify(request.query));
            if (!requestService) {
                return next(new InputException('request body is empty', response));
            }
            let backendRequest: BboxServiceRequest = {
                user_id: request.body.user_id,
                service: "bbox_intersect",
                parameters: {
                    tdei_dataset_id: requestService.tdei_dataset_id,
                    bbox: requestService.bbox
                }
            }

            let job_id = await oswService.processBackendRequest(backendRequest);
            response.setHeader('Location', `/api/v1/job?job_id=${job_id}`);
            return response.status(202).send(job_id);
        } catch (error) {
            console.error("Error while processing the dataset bbox request", error);
            if (error instanceof HttpException) {
                response.status(error.status).send(error.message);
                return next(error);
            }
            response.status(500).send("Error while processing the dataset bbox request");
            next(new HttpException(500, "Error while processing the dataset bbox request"));
        }
    }

    /**
    * Flatterning the tdei record 
    * @param request 
    * @param response 
    * @param next 
    * @returns 
    */
    processFlatteningRequest = async (request: Request, response: express.Response, next: NextFunction) => {
        try {
            let tdei_dataset_id = request.params["tdei_dataset_id"];
            let override = Boolean(request.query.override as string) ? true : false;

            let job_id = await oswService.processDatasetFlatteningRequest(request.body.user_id, tdei_dataset_id, override);
            response.setHeader('Location', `/api/v1/job?job_id=${job_id}`);
            return response.status(202).send(job_id);
        } catch (error) {
            console.error("Error while processing the flattening request", error);
            if (error instanceof HttpException) {
                response.status(error.status).send(error.message);
                return next(error);
            }
            response.status(500).send("Error while processing the flattening request");
            next(new HttpException(500, "Error while processing the flattening request"));
        }
    }

    /**
     * Function to create record in the database and upload the gtfs-osw files
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

            let job_id = await oswService.processUploadRequest(uploadRequest);
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

    /**
     * Request sent to calculate the 
     * @param request 
     * @param response 
     * @param next 
     */
    calculateConfidence = async (request: Request, response: express.Response, next: NextFunction) => {
        try {
            let tdei_dataset_id = request.params["tdei_dataset_id"];
            if (tdei_dataset_id == undefined) {
                response.status(400).send('Please add tdei_dataset_id in payload')
                return next()
            }
            let job_id = await oswService.calculateConfidence(tdei_dataset_id, request.body.user_id);
            response.setHeader('Location', `/api/v1/job?job_id=${job_id}`);
            return response.status(202).send(job_id);

        } catch (error) {
            console.error("Error while processing the calculate Confidence request", error);
            if (error instanceof HttpException) {
                response.status(error.status).send(error.message);
                return next(error);
            }
            response.status(500).send("Error while processing the calculate Confidence request");
            next(new HttpException(500, "Error while processing the calculate Confidence request"));
        }
    }

    /**
     * On-demand formatting request for convert osw file
     * @param request 
     * @param response 
     * @param next 
     * @returns 
     */
    createFormatRequest = async (request: Request, response: express.Response, next: NextFunction) => {
        try {
            const uploadedFile = request.file;
            if (uploadedFile == undefined) {
                throw new InputException("Missing upload file input");
            }
            let source = request.body['source']; //TODO: Validate the input enums 
            let target = request.body['target'];

            if (!["osw", "osm"].includes(target) && !["osw", "osm"].includes(source)) {
                throw new InputException("Invalid source/target value");
            }

            if (source == undefined || target == undefined) {
                throw new InputException("Missing source/target input");
            }

            if (source == target) {
                throw new InputException("Source and Target value cannot be same");
            }

            let job_id = await oswService.processFormatRequest(source, target, uploadedFile, request.body.user_id);
            response.setHeader('Location', `/api/v1/job?job_id=${job_id}`);
            return response.status(202).send(job_id);

        } catch (error) {
            console.error("Error while processing the format request", error);
            if (error instanceof HttpException) {
                response.status(error.status).send(error.message);
                return next(error);
            }
            response.status(500).send("Error while processing the format request");
            next(new HttpException(500, "Error while processing the format request"));
        }
    }
}

const oswController = new OSWController();
export default oswController;