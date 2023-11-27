import { NextFunction, Request } from "express";
import express from "express";
import { IController } from "./interface/IController";
import { OswQueryParams } from "../model/osw-get-query-params";
import { FileEntity } from "nodets-ms-core/lib/core/storage";
import oswService from "../service/Osw-service";
import HttpException from "../exceptions/http/http-base-exception";
import { DuplicateException, InputException, FileTypeException } from "../exceptions/http/http-exceptions";
import { OswVersions } from "../database/entity/osw-version-entity";
import { validate, ValidationError } from "class-validator";
import { Versions } from "../model/versions-dto";
import { environment } from "../environment/environment";
import multer, { memoryStorage } from "multer";
import { OswDTO } from "../model/osw-dto";
import { OswUploadMeta } from "../model/osw-upload-meta";
import storageService from "../service/storage-service";
import path from "path";
import { Readable } from "stream";
import { tokenValidator } from "../middleware/token-validation-middleware";
import { metajsonValidator } from "../middleware/json-validation-middleware";
import { EventBusService } from "../service/event-bus-service";
import validationMiddleware from "../middleware/dto-validation-middleware";
import { OswConfidenceJob } from "../database/entity/osw-confidence-job-entity";
import { OSWConfidenceRequest } from "../model/osw-confidence-request";
import { OswFormatJob } from "../database/entity/osw-format-job-entity";

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
        const ext = path.extname(file.originalname);
        if (ext != '.zip') {
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
        this.router.get(this.path, this.getAllOsw);
        this.router.get(`${this.path}/:id`, this.getOswById);
        this.router.post(this.path, upload.single('file'), metajsonValidator, tokenValidator, this.createOsw);
        this.router.get(`${this.path}/versions/info`, this.getVersions);
        this.router.post(`${this.path}/confidence/calculate`, this.calculateConfidence); // Confidence calculation
        this.router.get(`${this.path}/confidence/status/:jobId`,this.getConfidenceJobStatus);
        this.router.post(`${this.path}/format/upload`,upload.single('file'),this.createFormatRequest); // Format request
        this.router.get(`${this.path}/format/status/:jobId`,this.getFormatStatus);
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
            const osw = await oswService.getAllOsw(params);
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

            const fileEntity: FileEntity = await oswService.getOswById(request.params.id, format);

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

    /**
     * Function to create record in the database and upload the gtfs-osw files
     * @param request 
     * @param response 
     * @param next 
     * @returns 
     */

    createOsw = async (request: Request, response: express.Response, next: NextFunction) => {
        try {
            console.log('Received upload request');
            const meta = JSON.parse(request.body['meta']);
            const userId = request.body.user_id;
            // Validate the meta data
            const oswdto = OswUploadMeta.from(meta);
            const result = await validate(oswdto);
            console.log('result', result);

            if (result.length != 0) {
                console.log('Metadata validation failed');
                console.log(result);
                // Need to send these as response
                const message = result.map((error: ValidationError) => Object.values(<any>error.constraints)).join(', ');
                return response.status(400).send('Input validation failed with below reasons : \n' + message);
            }
            // Generate the files and upload them
            const uid = storageService.generateRandomUUID(); // Fetches a random UUID for the record
            const folderPath = storageService.getFolderPath(oswdto.tdei_project_group_id, uid);
            const uploadedFile = request.file;
            const uploadPath = path.join(folderPath, uploadedFile!.originalname)
            const remoteUrl = await storageService.uploadFile(uploadPath, 'application/zip', Readable.from(uploadedFile!.buffer))
            // Upload the meta file  
            const metaFilePath = path.join(folderPath, 'meta.json');
            const metaUrl = await storageService.uploadFile(metaFilePath, 'text/json', oswdto.getStream());
            // Insert into database
            const osw = OswVersions.from(meta);
            osw.tdei_record_id = uid;
            osw.file_upload_path = remoteUrl;
            osw.uploaded_by = userId;
            const returnInfo = await oswService.createOsw(osw);

            // Publish to the topic
            this.eventBusService.publishUpload(oswdto, uid, remoteUrl, userId, metaUrl);
            // Also send the information to the queue
            console.log('Responding to request');
            return response.status(202).send(uid);

        } catch (error) {
            console.error('Error saving the osw file', error);
            if (error instanceof HttpException) {
                next(error)
            } else {
                response.status(500).send('Error saving the osw file');
            }
        }
    }
    /**
     * Request sent to calculate the 
     * @param request 
     * @param response 
     * @param next 
     */
    calculateConfidence = async (request: Request, response: express.Response, next: NextFunction) => {
        console.log(request.body)
        const tdeiRecordId = request.body['tdeiRecordId']
        console.log(tdeiRecordId)
        if (tdeiRecordId == undefined) {
            response.status(400).send('Please add tdeiRecordId in payload')
            return next()
        }
        // Check and get the record for the same in the database
        try {
            const oswRecord = await oswService.getOSWRecordById(tdeiRecordId)
            console.log(oswRecord);
            // Create a job in the database for the same.
            //TODO: Have to add these based on some of the input data.
            const confidence_job = new OswConfidenceJob()
            confidence_job.tdei_record_id = tdeiRecordId
            confidence_job.trigger_type = 'manual'
            confidence_job.created_at = new Date()
            confidence_job.updated_at = new Date()
            confidence_job.status = 'started'
            confidence_job.cm_last_calculated_at = new Date()
            confidence_job.user_id = ''
            confidence_job.cm_version = 'v1.0'
            const jobId = await oswService.createOSWConfidenceJob(confidence_job);

            // Send the details to the confidence metric.
            //TODO: Fill based on the metadata received
            const confidenceRequestMsg = new OSWConfidenceRequest();
            confidenceRequestMsg.jobId = jobId;
            confidenceRequestMsg.data_file = oswRecord.download_url;
            //TODO: Once this is done, get the things moved.
            confidenceRequestMsg.meta_file = oswRecord.download_url;
            confidenceRequestMsg.trigger_type = 'manual'
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
            'jobId':jobId,
            'confidenceValue':jobInfo.confidence_metric,
            'status':jobInfo.status,
            'updatedAt':jobInfo.updated_at,
            'message':'ok' //Need to update this.
        };
        response.status(200).send(responseData);
    } catch (error){
        return next(error);
        
    }
    }

    createFormatRequest = async (request: Request, response: express.Response, next: NextFunction) => {
           // Get the file

            const uploadedFile = request.file;
            // Get the upload path
            const uid = storageService.generateRandomUUID();
            const folderPath = storageService.getFormatJobPath(uid);
            const uploadPath = path.join(folderPath,uploadedFile!.originalname)
            const extension = path.extname(uploadedFile!.originalname)
            let fileType = 'application/xml'
            if (extension == 'zip') {
                fileType = 'application/zip'
            }
            const remoteUrl = await storageService.uploadFile(uploadPath,fileType,Readable.from(uploadedFile!.buffer))
            console.log('Uplaoded to ');
            console.log(remoteUrl);
            const oswformatJob = new OswFormatJob();
            oswformatJob.created_at = new Date();
            oswformatJob.source = request.body['source'];
            oswformatJob.target = request.body['target'];
            oswformatJob.source_url = remoteUrl;
            oswformatJob.status = 'started'

            const jobId = await oswService.createOSWFormatJob(oswformatJob);
            console.log('JobId created')
            console.log(jobId);
            
            // Send the same to service bus.
            oswformatJob.jobId = parseInt(jobId);
            this.eventBusService.publishOnDemandFormat(oswformatJob);

            response.status(200).send({'jobId':jobId})
    }

    getFormatStatus = async (request: Request, response: express.Response, next: NextFunction) => {

        console.log('Requested status for format jobInfo ')
        try {
        const jobId = request.params['jobId']
        const jobInfo = await oswService.getOSWFormatJob(jobId)
        const responseData = {
            'jobId':jobId,
            'sourceUrl':jobInfo.source_url,
            'targetUrl':jobInfo.target_url,
            'conversion':jobInfo.source+'-'+jobInfo.target,
            'status':jobInfo.status,
            'message':jobInfo.message
        };
        response.status(200).send(responseData);
    } catch (error){
        return next(error);
        
    }
    }
}

const oswController = new GtfsOSWController();
export default oswController;