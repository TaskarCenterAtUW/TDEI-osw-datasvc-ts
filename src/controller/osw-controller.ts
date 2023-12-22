import { NextFunction, Request } from "express";
import express from "express";
import { IController } from "./interface/IController";
import { OswQueryParams } from "../model/osw-get-query-params";
import { FileEntity } from "nodets-ms-core/lib/core/storage";
import oswService from "../service/Osw-service";
import HttpException from "../exceptions/http/http-base-exception";
import { InputException, FileTypeException } from "../exceptions/http/http-exceptions";
import { Versions } from "../model/versions-dto";
import { environment } from "../environment/environment";
import multer, { memoryStorage } from "multer";
import storageService from "../service/storage-service";
import path from "path";
import { Readable } from "stream";
import { EventBusService } from "../service/event-bus-service";
import { OswConfidenceJob } from "../database/entity/osw-confidence-job-entity";
import { OSWConfidenceRequest } from "../model/osw-confidence-request";
import { OswFormatJob } from "../database/entity/osw-format-job-entity";
import { IUploadRequest } from "../service/interface/upload-request-interface";
import { metajsonValidator } from "../middleware/json-validation-middleware";
import { authorize } from "../middleware/authorize-middleware";
import { authenticate } from "../middleware/authenticate-middleware";
import archiver from 'archiver';
import fs from 'fs';
/**
  * Multer for multiple uploads
  * Configured to pull to 'uploads' folder
  * and buffer is available with the request
  * File filter is added to ensure only files with .zip extension
  * are allowed
  */

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

    eventBusService = new EventBusService();

    public intializeRoutes() {
        this.router.get(this.path, authenticate, this.getAllOsw);
        this.router.get(`${this.path}/:id`, this.getOswById);
        this.router.post(`${this.path}/upload/:tdei_project_group_id/:tdei_service_id`, upload.fields([
            { name: "dataset", maxCount: 1 },
            { name: "metadata", maxCount: 1 },
            { name: "changeset", maxCount: 1 }
        ]), metajsonValidator, authenticate, authorize(["tdei_admin", "poc", "osw_data_generator"]), this.processUploadRequest);
        this.router.post(`${this.path}/publish/:tdei_record_id`, authenticate, authorize(["tdei_admin", "poc", "osw_data_generator"]), this.processPublishRequest);
        this.router.post(`${this.path}/validate`, upload.single('dataset'), authenticate, this.processValidationOnlyRequest);
        this.router.get(`${this.path}/versions/info`, authenticate, this.getVersions);
        this.router.post(`${this.path}/confidence/calculate`, authenticate, this.calculateConfidence); // Confidence calculation
        this.router.get(`${this.path}/confidence/status/:jobId`, authenticate, this.getConfidenceJobStatus);
        this.router.post(`${this.path}/format/upload`, uploadForFormat.single('file'), authenticate, this.createFormatRequest); // Format request
        this.router.get(`${this.path}/format/status/:jobId`, authenticate, this.getFormatStatus);
    }

    getVersions = async (request: Request, response: express.Response, next: NextFunction) => {
        let versionsList = new Versions([{
            documentation: environment.gatewayUrl as string,
            specification: "https://github.com/OpenSidewalks/OpenSidewalks-Schema",
            version: "v0.1"
        }]);

        response.status(200).send(versionsList);
    }

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

    getOswById = async (request: Request, response: express.Response, next: NextFunction) => {

        try {
            let format = request.query.format as string ?? 'osw';

            const fileEntities: FileEntity[] = await oswService.getOswStreamById(request.params.id, format);

            const zipFileName = 'osw.zip';

            // Create a writable stream for the zip file
            const zipStream = fs.createWriteStream(zipFileName);

            // Create a new zip archive
            const archive = archiver('zip', { zlib: { level: 9 } });

            // Pipe the archive to the zip stream
            archive.pipe(zipStream);

            // Add files to the zip archive
            for (const filee of fileEntities) {
                let stream = await filee.getStream();
                archive.append(stream.read(), { name: filee.fileName });
            }

            // Finalize the archive and close the zip stream
            archive.finalize();
            zipStream.on('close', () => {
                // Set the response headers for downloading the zip file
                response.setHeader('Content-Type', 'application/zip');
                response.setHeader('Content-Disposition', `attachment; filename=${zipFileName}`);

                // Pipe the zip file to the response
                const zipFile = fs.createReadStream(zipFileName);
                zipFile.pipe(response);
                response.status(200);

                // Delete the generated zip file after sending
                zipFile.on('close', () => fs.unlinkSync(zipFileName));
            });
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
            console.log('Received upload request');
            //TODO:: Verify tdei_service_id is allowed to do the upload for OSW file type
            let datasetFile = (request.files as any)['dataset'];

            if (!datasetFile) {
                console.error("dataset file input upload missing");
                response.status(400).send("dataset file input upload missing");
                next(new InputException("dataset file input upload missing"));
            }

            let job_id = await oswService.processValidationOnlyRequest(request.body.user_id, datasetFile);
            response.setHeader('Location', `/validation/status/${job_id}`);
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

            response.setHeader('Location', `/publish/status/${tdei_record_id}`);
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
            response.setHeader('Location', `/upload/status/${tdei_record_id}`);
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
        const tdeiRecordId = request.body['tdeiRecordId']
        console.log(tdeiRecordId)
        if (tdeiRecordId == undefined) {
            response.status(400).send('Please add tdeiRecordId in payload')
            return next()
        }
        // Check and get the record for the same in the database
        try {
            const oswRecord = await oswService.getOSWRecordById(tdeiRecordId)
            // Create a job in the database for the same.
            //TODO: Have to add these based on some of the input data.
            const confidence_job = new OswConfidenceJob()
            confidence_job.tdei_record_id = tdeiRecordId;
            confidence_job.trigger_type = 'manual';
            confidence_job.created_at = new Date();
            confidence_job.updated_at = new Date();
            confidence_job.status = 'started';
            confidence_job.cm_last_calculated_at = new Date();
            confidence_job.user_id = '';
            confidence_job.cm_version = 'v1.0';
            const jobId = await oswService.createOSWConfidenceJob(confidence_job);

            // Send the details to the confidence metric.
            //TODO: Fill based on the metadata received
            const confidenceRequestMsg = new OSWConfidenceRequest();
            confidenceRequestMsg.jobId = jobId; // skip tdei-record-id
            confidenceRequestMsg.data_file = oswRecord.download_osw_url;
            //TODO: Once this is done, get the things moved.
            confidenceRequestMsg.meta_file = oswRecord.download_metadata_url;
            confidenceRequestMsg.trigger_type = 'manual' //release
            this.eventBusService.publishConfidenceRequest(confidenceRequestMsg);
            // Send the jobId back to the user.
            return response.status(200).send({ 'jobId': jobId, 'tdeiRecordId': tdeiRecordId });
        }
        catch (error) {
            console.log(error);
        }

        response.status(200).send('ok');
    }

    getConfidenceJobStatus = async (request: Request, response: express.Response, next: NextFunction) => {
        console.log('Requested status for jobInfo ')
        try {
            const jobId = request.params['jobId']
            const jobInfo = await oswService.getOSWConfidenceJob(jobId)
            const responseData = {
                'jobId': jobId,
                'confidenceValue': jobInfo.confidence_metric,
                'status': jobInfo.status,
                'updatedAt': jobInfo.updated_at,
                'message': 'ok' //Need to update this.
            };
            response.status(200).send(responseData);
        } catch (error) {
            return next(error);

        }
    }

    createFormatRequest = async (request: Request, response: express.Response, next: NextFunction) => {
        // Get the file

        const uploadedFile = request.file;
        // Get the upload path
        const uid = storageService.generateRandomUUID();
        const folderPath = storageService.getFormatJobPath(uid);
        const uploadPath = path.join(folderPath, uploadedFile!.originalname)
        const extension = path.extname(uploadedFile!.originalname)
        let fileType = 'application/xml'
        if (extension == 'zip') {
            fileType = 'application/zip'
        }
        const remoteUrl = await storageService.uploadFile(uploadPath, fileType, Readable.from(uploadedFile!.buffer))
        console.log('Uplaoded to ', remoteUrl);
        const oswformatJob = new OswFormatJob();
        oswformatJob.created_at = new Date();
        oswformatJob.source = request.body['source']; //TODO: Validate the input enums 
        oswformatJob.target = request.body['target']; //TODO: Validate the input enums
        oswformatJob.source_url = remoteUrl;
        oswformatJob.status = 'started'

        const jobId = await oswService.createOSWFormatJob(oswformatJob);
        console.log('JobId created ', jobId)

        // Send the same to service bus.
        oswformatJob.jobId = parseInt(jobId);
        this.eventBusService.publishOnDemandFormat(oswformatJob);

        response.status(200).send({ 'jobId': jobId })
    }

    getFormatStatus = async (request: Request, response: express.Response, next: NextFunction) => {

        console.log('Requested status for format jobInfo ')
        try {
            const jobId = request.params['jobId'];
            if (jobId == undefined || jobId == '') {
                return next(new InputException('jobId not provided'));
            }
            const jobInfo = await oswService.getOSWFormatJob(jobId);
            const responseData = {
                'jobId': jobId,
                'sourceUrl': jobInfo.source_url,
                'targetUrl': jobInfo.target_url,
                'conversion': jobInfo.source + '-' + jobInfo.target,
                'status': jobInfo.status,
                'message': jobInfo.message
            };
            response.status(200).send(responseData);
        } catch (error) {
            return next(error);

        }
    }
}

const oswController = new GtfsOSWController();
export default oswController;