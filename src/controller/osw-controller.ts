import { NextFunction, Request } from "express";
import express from "express";
import { IController } from "./interface/IController";
import { OswQueryParams } from "../model/osw-get-query-params";
import { FileEntity } from "nodets-ms-core/lib/core/storage";
import oswService from "../service/osw-service";
import HttpException from "../exceptions/http/http-base-exception";
import { InputException, FileTypeException, JobIncompleteException } from "../exceptions/http/http-exceptions";
import { Versions } from "../model/versions-dto";
import { environment } from "../environment/environment";
import multer, { memoryStorage } from "multer";
import path from "path";
import { IUploadRequest } from "../service/interface/upload-request-interface";
import { metajsonValidator } from "../middleware/metadata-json-validation-middleware";
import { authorize } from "../middleware/authorize-middleware";
import { authenticate } from "../middleware/authenticate-middleware";
import archiver from 'archiver';
import workflowDatabaseService from "../orchestrator/services/workflow-database-service";
import { FileEntityStream } from "../utility/utility";
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

class GtfsOSWController implements IController {
    public path = '/api/v1/osw';
    public router = express.Router();
    constructor() {
        this.intializeRoutes();
    }

    public intializeRoutes() {
        this.router.get(this.path, authenticate, this.getAllOsw);
        this.router.get(`${this.path}/:id`, this.getOswById);
        this.router.post(`${this.path}/validate`, validate.single('dataset'), authenticate, this.processValidationOnlyRequest);
        this.router.post(`${this.path}/upload/:tdei_project_group_id/:tdei_service_id`, upload.fields([
            { name: "dataset", maxCount: 1 },
            { name: "metadata", maxCount: 1 },
            { name: "changeset", maxCount: 1 }
        ]), metajsonValidator, authenticate, authorize(["tdei_admin", "poc", "osw_data_generator"]), this.processUploadRequest);
        this.router.post(`${this.path}/publish/:tdei_record_id`, authenticate, authorize(["tdei_admin", "poc", "osw_data_generator"]), this.processPublishRequest);
        this.router.get(`${this.path}/versions/info`, authenticate, this.getVersions);
        this.router.post(`${this.path}/confidence/calculate`, authenticate, this.calculateConfidence); // Confidence calculation
        this.router.get(`${this.path}/confidence/status/:job_id`, authenticate, this.getConfidenceJobStatus);
        this.router.post(`${this.path}/convert`, uploadForFormat.single('file'), authenticate, this.createFormatRequest); // Format request
        this.router.post(`${this.path}/invalidate/:tdei_record_id`, authenticate, this.invalidateRecordRequest);
        this.router.get(`${this.path}/convert/status/:job_id`, authenticate, this.getFormatStatus);
        this.router.get(`${this.path}/validate/status/:job_id`, authenticate, this.getValidateStatus);
        this.router.get(`${this.path}/upload/status/:tdei_record_id`, authenticate, this.getUploadStatus);
        this.router.get(`${this.path}/publish/status/:tdei_record_id`, authenticate, this.getPublishStatus);
        this.router.get(`${this.path}/convert/download/:job_id`, authenticate, this.getFormatDownloadFile); // Download the formatted file
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
     * Gets the list of OSW versions
     * @param request 
     * @param response 
     * @param next 
     */
    getAllOsw = async (request: Request, response: express.Response, next: NextFunction) => {
        try {
            const params: OswQueryParams = new OswQueryParams(JSON.parse(JSON.stringify(request.query)));
            const osw = await oswService.getAllOsw(request.body.user_id, params);
            osw.forEach(x => {
                x.download_url = `${this.path}/${x.tdei_record_id}`;
            });
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

    /**
     * Given the tdei_record_id api downloads the zip file containing osw files.
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
            response.setHeader('Location', `/api/v1/osw/validation/status/${job_id}`);
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
            let tdei_record_id = request.params["tdei_record_id"];
            await oswService.processPublishRequest(request.body.user_id, tdei_record_id);

            response.setHeader('Location', `/api/v1/osw/publish/status/${tdei_record_id}`);
            return response.status(202).send(tdei_record_id);

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
    * Invalidates the tdei record 
    * @param request 
    * @param response 
    * @param next 
    * @returns 
    */
    invalidateRecordRequest = async (request: Request, response: express.Response, next: NextFunction) => {
        try {
            let tdei_record_id = request.params["tdei_record_id"];
            await oswService.invalidateRecordRequest(request.body.user_id, tdei_record_id);

            return response.status(200).send(true);

        } catch (error) {
            console.error("Error while processing the invalidate request", error);
            if (error instanceof HttpException) {
                response.status(error.status).send(error.message);
                return next(error);
            }
            response.status(500).send("Error while processing the invalidate request");
            next(new HttpException(500, "Error while processing the invalidate request"));
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

            let tdei_record_id = await oswService.processUploadRequest(uploadRequest);
            response.setHeader('Location', `/api/v1/osw/upload/status/${tdei_record_id}`);
            return response.status(202).send(tdei_record_id);

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
            const tdei_record_id = request.body['tdei_record_id'];
            if (tdei_record_id == undefined) {
                response.status(400).send('Please add tdei_record_id in payload')
                return next()
            }
            let job_id = await oswService.calculateConfidence(tdei_record_id, request.body.user_id,);
            response.setHeader('Location', `/api/v1/osw/confidence/status/${job_id}`);
            return response.status(202).send({ 'job_id': job_id, 'tdei_record_id': tdei_record_id });

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

    getConfidenceJobStatus = async (request: Request, response: express.Response, next: NextFunction) => {
        console.log('Requested status for jobInfo ')
        try {
            const job_id = request.params['job_id']
            const jobInfo = await oswService.getOSWConfidenceJob(job_id)
            const responseData = {
                'job_id': job_id,
                'confidenceValue': jobInfo.confidence_metric,
                'status': jobInfo.status,
                'updatedAt': jobInfo.updated_at,
                'message': 'ok' //Need to update this.
            };
            response.status(200).send(responseData);
        } catch (error) {
            console.log("Error processing confidence status api", error);
            return next(error);
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
            if (source == undefined || target == undefined) {
                throw new InputException("Missing source/target input");
            }

            if (source == target) {
                throw new InputException("Source and Target value cannot be same");
            }

            let job_id = await oswService.processFormatRequest(source, target, uploadedFile, request.body.user_id,);
            response.setHeader('Location', `/api/v1/osw/convert/status/${job_id}`);
            return response.status(202).send({ 'job_id': job_id });

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

    /**
     * Gets the status for the on-demand formatting job
     * @param request 
     * @param response 
     * @param next 
     * @returns 
     */
    getFormatStatus = async (request: Request, response: express.Response, next: NextFunction) => {

        console.log('Requested status for format jobInfo ')
        try {
            const job_id = request.params['job_id'];
            if (job_id == undefined || job_id == '') {
                return next(new InputException('job_id not provided'));
            }
            const jobInfo = await oswService.getOSWFormatJob(job_id);
            const responseData = {
                'job_id': job_id,
                'downloadUrl': '/api/v1/osw/convert/download/' + job_id,
                'conversion': jobInfo.source + '-' + jobInfo.target,
                'status': jobInfo.status,
                'message': jobInfo.message
            };
            response.status(200).send(responseData);
        } catch (error) {
            return next(error);

        }
    }
    /**
     * Gives the downloadable stream for the job status
     * @param request 
     * @param response 
     * @param next 
     * @returns 
     */
    getFormatDownloadFile = async (request: Request, response: express.Response, next: NextFunction) => {

        console.log('Download formatted file for jobInfo ')
        try {
            const job_id = request.params['job_id'];
            if (job_id == undefined || job_id == '') {
                return next(new InputException('job_id not provided'));
            }
            const jobInfo = await oswService.getOSWFormatJob(job_id);

            if (jobInfo.status != 'completed') {
                throw new JobIncompleteException(job_id);
            }
            // Get the file entity for the file
            const fileEntity = await oswService.getFileEntity(jobInfo.target_url);
            if (jobInfo.target == 'osm') {
                // OSM implies xml file
                response.setHeader('Content-Type', 'application/xml');
                response.setHeader('Content-Disposition', `attachment; filename=${fileEntity.fileName}`);
                (await fileEntity.getStream()).pipe(response);

            }
            else if (jobInfo.target == 'osw') {
                response.setHeader('Content-Type', 'application/zip');
                response.setHeader('Content-Disposition', `attachment; filename=${fileEntity.fileName}`);
                (await fileEntity.getStream()).pipe(response);
            }
            else {
                response.status(400).send(`Unkown target type ${jobInfo.target} `)
            }
        } catch (error) {
            return next(error);

        }
    }

    /**
    * Gets the status for the on-demand validating job
    * @param request 
    * @param response 
    * @param next 
    * @returns 
    */
    getValidateStatus = async (request: Request, response: express.Response, next: NextFunction) => {
        try {
            const job_id = request.params['job_id'];
            if (job_id == undefined || job_id == '') {
                return next(new InputException('job_id not provided'));
            }
            const jobInfo = await oswService.getOSWValidationJob(job_id);
            const responseData = {
                'job_id': job_id,
                'status': jobInfo.status,
                'validation_result': jobInfo.validation_result == "" ? "Valid" : jobInfo.validation_result,
                'updated_at': jobInfo.updated_at
            };
            response.status(200).send(responseData);
        } catch (error) {
            return next(error);

        }
    }

    /**
    * Gets the status for the publish record 
    * @param request 
    * @param response 
    * @param next 
    * @returns 
    */
    getPublishStatus = async (request: Request, response: express.Response, next: NextFunction) => {
        try {
            const tdei_record_id = request.params['tdei_record_id'];
            if (tdei_record_id == undefined || tdei_record_id == '') {
                return next(new InputException('tdei_record_id not provided'));
            }
            let workflowRow = await workflowDatabaseService.getLatestWorkflowHistory(tdei_record_id, "PUBLISH_OSW");
            if (!workflowRow)
                throw new InputException(`Publish record not initiated for the ${tdei_record_id}`);

            const oswRecord = await oswService.getOSWRecordById(tdei_record_id);
            const responseData = {
                'tdei_record_id': workflowRow.reference_id,
                'stage': workflowRow.workflow_stage,
                'status': workflowRow.status != "" ? workflowRow.status : "Pending",
                'completed': oswRecord.status == "Publish" ? true : false
            };
            response.status(200).send(responseData);
        } catch (error) {
            console.error("Error processing the publish status api", error);
            if (error instanceof HttpException) {
                response.status(error.status).send(error.message);
                return next(error);
            }
            return next(error);
        }
    }

    /**
    * Gets the status for upload record
    * @param request 
    * @param response 
    * @param next 
    * @returns 
    */
    getUploadStatus = async (request: Request, response: express.Response, next: NextFunction) => {
        try {
            const tdei_record_id = request.params['tdei_record_id'];
            if (tdei_record_id == undefined || tdei_record_id == '') {
                return next(new InputException('tdei_record_id not provided'));
            }

            let workflowRow = await workflowDatabaseService.getLatestWorkflowHistory(tdei_record_id, "UPLOAD_OSW");
            if (!workflowRow)
                throw new InputException(`Publish record not initiated for the ${tdei_record_id}`);

            const responseData = {
                'tdei_record_id': workflowRow.reference_id,
                'stage': workflowRow.workflow_stage,
                'status': workflowRow.status == "Success" ? workflowRow.status : workflowRow.message,
                'completed': workflowRow.status != "" ? true : false
            };
            response.status(200).send(responseData);
        } catch (error) {
            console.error("Error processing the publish status api", error);
            if (error instanceof HttpException) {
                response.status(error.status).send(error.message);
                return next(error);
            }
            return next(error);
        }
    }
}

const oswController = new GtfsOSWController();
export default oswController;