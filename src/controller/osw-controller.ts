import { NextFunction, Request } from "express";
import express from "express";
import { IController } from "./interface/IController";
import oswService from "../service/osw-service";
import HttpException from "../exceptions/http/http-base-exception";
import { InputException, FileTypeException, UnAuthenticated, ForbiddenAccess } from "../exceptions/http/http-exceptions";
import { Versions } from "../model/versions-dto";
import { environment } from "../environment/environment";
import multer, { memoryStorage } from "multer";
import path from "path";
import { IUploadRequest } from "../service/interface/upload-request-interface";
import { metajsonValidator } from "../middleware/metadata-json-validation-middleware";
import { authorize } from "../middleware/authorize-middleware";
import { authenticate } from "../middleware/authenticate-middleware";
import { BboxServiceRequest, TagRoadServiceRequest, InclinationServiceRequest } from "../model/backend-request-interface";
import tdeiCoreService from "../service/tdei-core-service";
import { Utility } from "../utility/utility";
import Ajv, { ErrorObject } from "ajv";
import polygonSchema from "../../schema/polygon.geojson.schema.json";
import { SpatialJoinRequest, UnionRequest } from "../model/request-interfaces";
import { apiTracker } from "../middleware/api-tracker";
import { ONE_GB_IN_BYTES, JOBS_API_PATH } from "../constants/app-constants";
import { FeedbackRequestDto } from "../model/feedback-dto";
import { feedbackRequestParams } from "../model/feedback-request-params";
import { FeedbackDownloadRequestParams } from "../model/feedback-download-request-params";
import { listRequestValidation } from "../middleware/list-request-validation-middleware";
import { FeedbackStatusRequestDto } from "../model/feedback-status-dto";
/**
  * Multer for multiple uploads
  * Configured to pull to 'uploads' folder
  * and buffer is available with the request
  * File filter is added to ensure only files with .zip extension
  * are allowed
  */
const ajv = new Ajv({ allErrors: true });
const validatePolygonGeojson = ajv.compile(polygonSchema);

const tagQuality = multer({
    dest: 'tagQuality/',
    storage: memoryStorage(),
    fileFilter: (req, file, cb) => {
        const allowedFileTypes = ['.json'];
        const ext = path.extname(file.originalname);
        if (!allowedFileTypes.includes(ext)) {
            cb(new FileTypeException());
        }
        cb(null, true);
    }
});

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
            req.body["dataset_file_size"] = file.size;
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

// Accepted format files for on-demand conversion
const acceptedFileFormatsForConversion = ['.zip', '.pbf', '.osm', '.xml'];

const uploadForFormat = multer({
    dest: 'uploads/',
    storage: memoryStorage(),
    fileFilter: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        if (!acceptedFileFormatsForConversion.includes(ext)) {
            cb(new FileTypeException());
        }
        cb(null, true);
    }
});

const acceptedFileFormatsForConfidence = ['.geojson'];
const confidenceUpload = multer({
    dest: 'confidence/',
    storage: memoryStorage(),
    fileFilter: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        if (!acceptedFileFormatsForConfidence.includes(ext)) {
            cb(new FileTypeException());
        }
        cb(null, true);
    }
});

// Accepted file formats for quality metric calculation
const qualityUpload = multer({
    dest: 'quality/',
    storage: memoryStorage(),
    fileFilter: (req, file, cb) => {
        const allowedFileTypes = ['.geojson'];
        const ext = path.extname(file.originalname);
        if (!allowedFileTypes.includes(ext)) {
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
        this.router.get(`${this.path}/:id`, apiTracker, authenticate, this.getOswById);
        this.router.post(`${this.path}/validate`, validate.single('dataset'), apiTracker, authenticate, this.processValidationOnlyRequest);
        this.router.post(`${this.path}/upload/:tdei_project_group_id/:tdei_service_id`, upload.fields([
            { name: "dataset", maxCount: 1 },
            { name: "metadata", maxCount: 1 },
            { name: "changeset", maxCount: 1 }
        ]), metajsonValidator('dataset_upload'), apiTracker, authenticate, authorize(["tdei_admin", "poc", "osw_data_generator"]), this.processUploadRequest);
        this.router.post(`${this.path}/publish/:tdei_dataset_id`, apiTracker, authenticate, authorize(["tdei_admin", "poc", "osw_data_generator"]), this.processPublishRequest);
        this.router.get(`${this.path}/versions/info`, apiTracker, authenticate, this.getVersions);
        this.router.post(`${this.path}/confidence/:tdei_dataset_id`, confidenceUpload.single('file'), apiTracker, authenticate, this.calculateConfidence); // Confidence calculation
        this.router.post(`${this.path}/convert`, uploadForFormat.single('file'), apiTracker, authenticate, this.createFormatRequest); // Format request
        this.router.post(`${this.path}/dataset-bbox`, apiTracker, authenticate, this.processDatasetBboxRequest);
        this.router.post(`${this.path}/dataset-tag-road`, apiTracker, authenticate, this.processDatasetTagRoadRequest);
        this.router.post(`${this.path}/spatial-join`, apiTracker, authenticate, this.processSpatialQueryRequest);
        // Route for quality metric request
        this.router.post(`${this.path}/quality-metric/ixn/:tdei_dataset_id`, qualityUpload.single('file'), apiTracker, authenticate, this.createIXNQualityOnDemandRequest);
        this.router.post(`${this.path}/quality-metric/tag/:tdei_dataset_id`, tagQuality.single('file'), apiTracker, authenticate, this.tagQualityMetric);
        this.router.post(`${this.path}/quality-report/:tdei_dataset_id`, apiTracker, authenticate, this.createQualityReportJob);
        this.router.post(`${this.path}/dataset-inclination/:tdei_dataset_id`, apiTracker, authenticate, this.createInclineRequest);
        this.router.post(`${this.path}/union`, apiTracker, authenticate, this.processDatasetUnionRequest);
        //TODO:: Domain check authorization
        this.router.post(`${this.path}/dataset-viewer/feedbacks/:project_id/:tdei_dataset_id`, apiTracker, authenticate, this.addFeedbackRequest);
        this.router.get(`${this.path}/dataset-viewer/feedbacks`, apiTracker, authenticate, listRequestValidation, this.getFeedbackRequests);
        this.router.get(`${this.path}/dataset-viewer/feedbacks/metadata`, apiTracker, authenticate, this.getFeedbackMetadata);
        this.router.get(`${this.path}/dataset-viewer/feedbacks/download/:tdei_project_group_id`, apiTracker, authenticate, authorize(["tdei_admin", "poc", "osw_data_generator"]), this.downloadFeedbacks);
        this.router.post(`${this.path}/dataset-viewer/:tdei_dataset_id`, apiTracker, authenticate, authorize(["tdei_admin", "poc", "osw_data_generator"]), this.updateDatasetVisibility);
        this.router.get(`${this.path}/dataset-viewer/pm-tiles/:tdei_dataset_id`, apiTracker, authenticate, this.retrievePmTiles);
        this.router.post(`${this.path}/dataset/generate/pm-tiles/:tdei_dataset_id`, apiTracker, authenticate, authorize(["tdei_admin", "poc", "osw_data_generator"]), this.generatePMtiles);
        this.router.put(`${this.path}/dataset-viewer/feedbacks/:project_id/:tdei_dataset_id`, apiTracker, authenticate, authorize(["tdei_admin", "poc", "osw_data_generator", "member"]), this.updateFeedbackStatus);
    }

    async updateFeedbackStatus(request: Request, response: express.Response, next: NextFunction) {
        try {
            const tdei_project_group_id = request.params.project_id;
            const tdei_dataset_id = request.params.tdei_dataset_id;

            //verify body is an array
            if (!Array.isArray(request.body)) {
                return response.status(400).send("Request body must be an array of Feedback status objects");
            }
            //Accept array of feedback status updates
            let feedbackStatusUpdates: FeedbackStatusRequestDto[] = [];
            for (const value of request.body) {
                const feedbackStatusUpdate = FeedbackStatusRequestDto.from(value);
                const isValid = await feedbackStatusUpdate.validateRequestInput();
                if (isValid) {
                    feedbackStatusUpdates.push(feedbackStatusUpdate);
                }
            }
            const user_id = (request.body as any).user_id;
            const feedbackStatusReport = await oswService.updateFeedbackStatus(tdei_project_group_id, tdei_dataset_id, user_id, feedbackStatusUpdates);
            response.status(200).send(feedbackStatusReport);
        } catch (error) {
            console.error("Error while updating the feedback status", error);
            if (error instanceof HttpException) {
                response.status(error.status).send(error.message);
                return next(error);
            }
            response.status(500).send("Error while updating the feedback status");
        }
    }

    /**
     * Generates PM tiles for a dataset.
     * @param req - The request object.
     * @param res - The response object.
     * @param next - The next middleware function.
     */
    async generatePMtiles(req: Request, res: express.Response, next: NextFunction) {
        try {
            let tdei_dataset_id = req.params["tdei_dataset_id"];
            // Call the service to generate PM tiles
            let job_id = await oswService.generatePMTiles(req.body.user_id, tdei_dataset_id);
            res.setHeader('Location', `${JOBS_API_PATH}?job_id=${job_id}`);
            return res.status(202).send(job_id);
        } catch (error) {
            console.error("Error while generating PM tiles", error);
            if (error instanceof HttpException) {
                res.status(error.status).send(error.message);
                return next(error);
            }
            res.status(500).send("Error while generating PM tiles");
        }
    }

    /**
     * Updates the PM tiles for a dataset.
     * @param req - The request object.
     * @param res - The response object.
     * @param next - The next middleware function.
     */
    async retrievePmTiles(req: Request, res: express.Response, next: NextFunction) {
        try {
            let pmTilesUrl = await oswService.getDownloadableOSWPmTilesUrl(req.params["tdei_dataset_id"]);
            res.status(200).send(pmTilesUrl);
        } catch (error) {
            console.error("Error while retriving the PM tiles", error);
            if (error instanceof HttpException) {
                res.status(error.status).send(error.message);
                return next(error);
            }
            res.status(500).send("Error while retriving the PM tiles");
        }
    }


    /**
     * Updates the visibility of a dataset.
     * @param tdei_dataset_id - The ID of the TDEI dataset.
     * @param updateDatasetVisibility - Function to update the dataset visibility.
     */
    async updateDatasetVisibility(request: Request, response: express.Response, next: NextFunction) {
        try {
            const tdei_dataset_id = request.params["tdei_dataset_id"];
            const allow_viewer_access = request.body.allow_viewer_access;

            if (allow_viewer_access === undefined || allow_viewer_access === null) {
                throw new InputException("allow_viewer_access is required");
            }

            // Validate the visibility value
            if (typeof allow_viewer_access !== 'boolean') {
                throw new InputException("allow_viewer_access must be a boolean value");
            }

            // Update the dataset visibility
            await oswService.updateDatasetVisibility(tdei_dataset_id, allow_viewer_access);
            response.status(200).send("Dataset visibility updated successfully");
        } catch (error) {
            console.error("Error while updating the dataset visibility", error);
            if (error instanceof HttpException) {
                response.status(error.status).send(error.message);
                return next(error);
            }
            response.status(500).send("Error while updating the dataset visibility");
        }
    }


    /**
    * Gets feedback metadata
    * @param request
    * @param response
    * @param next
    * @returns
    */
    async getFeedbackMetadata(request: Request, response: express.Response, next: NextFunction) {

        try {
            const tdei_project_group_id = request.query["tdei_project_group_id"];
            const feedbackMetadata = await oswService.getFeedbacksMetadata(request.body.user_id, tdei_project_group_id as string);
            response.status(200).send(feedbackMetadata);
        } catch (error) {
            console.error(error);
            if (error instanceof InputException) {
                response.status(error.status).send(error.message);
                next(error);
            }
            else {
                response.status(500).send("Error while fetching the feedback metadata");
                next(new HttpException(500, "Error while fetching the feedback metadata"));
            }
        }
    }

    /**
     * Gets feedback requests
     * @param request
     * @param response
     * @param next
     * @returns
     */
    async getFeedbackRequests(request: Request, response: express.Response, next: NextFunction) {

        try {
            const params: feedbackRequestParams = new feedbackRequestParams(JSON.parse(JSON.stringify(request.query)));
            await params.validateRequestInput();
            const feedbacks = await oswService.getFeedbacks(request.body.user_id, params);
            response.status(200).send(feedbacks);
        } catch (error) {
            console.error(error);
            if (error instanceof InputException) {
                response.status(error.status).send(error.message);
                next(error);
            }
            else {
                response.status(500).send("Error while fetching the feedback information");
                next(new HttpException(500, "Error while fetching the feedback information"));
            }
        }
    }

    /**
     * Streams feedbacks as CSV for a project group.
     * Only users with roles `poc` and `osw_data_generator` are permitted.
     * @param request
     * @param response
     * @param next
     */
    async downloadFeedbacks(request: Request, response: express.Response, next: NextFunction) {
        try {
            const initParams: any = { ...request.query };
            if (request.params?.tdei_project_group_id) {
                initParams.tdei_project_group_id = request.params.tdei_project_group_id;
            }
            const params = new FeedbackDownloadRequestParams(JSON.parse(JSON.stringify(initParams)));
            await params.validateRequestInput();
            const stream = await oswService.downloadFeedbacks(params);
            const contentType = params.format === 'geojson' ? 'application/geo+json' : 'text/csv';
            response.setHeader('Content-Type', contentType);
            response.setHeader('Content-Disposition', `attachment; filename="feedback.${params.format}"`);
            stream.pipe(response);
        } catch (error) {
            console.error(error);
            if (error instanceof InputException) {
                response.status(error.status).send(error.message);
                next(error);
            }
            else {
                response.status(500).send("Error while downloading the feedback information");
                next(new HttpException(500, "Error while downloading the feedback information"));
            }
        }
    }

    /**
     * Processes the feedback request
     * @param request
     * @param response
     * @param next
     * @returns
     */
    async addFeedbackRequest(request: Request, response: express.Response, next: NextFunction) {

        try {
            if (!request.body) {
                return next(new InputException('request body is empty', response));
            }

            const feedback = FeedbackRequestDto.from(request.body);
            feedback.tdei_project_id = request.params.project_id;
            feedback.tdei_dataset_id = request.params.tdei_dataset_id;
            await feedback.validateRequestInput();

            Utility.checkForSqlInjection(feedback);
            const feedbackId = await oswService.addFeedbackRequest(feedback);
            return response.status(200).send(feedbackId);

        } catch (error) {
            console.error("Error while processing the feedback request", error);
            if (error instanceof HttpException) {
                response.status(error.status).send(error.message);
                return next(error);
            }
            response.status(500).send("Error while processing the feedback request");
            next(new HttpException(500, "Error while processing the feedback request"));
        }
    }


    /**
    * Processes the union request 
    * @param request 
    * @param response 
    * @param next 
    * @returns 
    */
    processDatasetUnionRequest = async (request: Request, response: express.Response, next: NextFunction) => {
        try {
            if (!request.body) {
                return next(new InputException('request body is empty', response));
            }

            const requestService = UnionRequest.from(request.body);
            await requestService.validateRequestInput();
            Utility.checkForSqlInjection(request.body);
            const job_id = await oswService.processUnionRequest(request.body.user_id, requestService);
            response.setHeader('Location', `${JOBS_API_PATH}?job_id=${job_id}`);
            return response.status(202).send(job_id);

        } catch (error) {
            console.error("Error while processing the union dataset request", error);
            if (error instanceof HttpException) {
                response.status(error.status).send(error.message);
                return next(error);
            }
            response.status(500).send("Error while processing the union dataset request");
            next(new HttpException(500, "Error while processing the union dataset request"));
        }
    }

    /**
     * Calculates the quality metric for a given osw entity tags.
     * @param request 
     * @param response 
     * @param next 
     * @returns 
     */
    tagQualityMetric = async (request: Request, response: express.Response, next: NextFunction) => {
        try {
            const tagFile = request.file;

            let result = await oswService.calculateTagQualityMetric(request.params["tdei_dataset_id"], tagFile, request.body.user_id);
            return response.status(200).send(result);
        } catch (error) {
            console.error("Error calculating the quality metric for a given osw entity tags", error);
            if (error instanceof HttpException) {
                response.status(error.status).send(error.message);
                return next(error);
            }
            response.status(500).send("Error calculating the quality metric for a given osw entity tags");
            next(new HttpException(500, "Error calculating the quality metric for a given osw entity tags"));
        }
    }


    /**
     * Spatial join request
     * @param request 
     * @param response 
     * @param next 
     * @returns 
     */
    processSpatialQueryRequest = async (request: Request, response: express.Response, next: NextFunction) => {
        try {
            if (!request.body) {
                return next(new InputException('request body is empty', response));
            }

            const requestService = SpatialJoinRequest.from(request.body);
            await requestService.validateRequestInput();
            Utility.checkForSqlInjection(request.body);
            const job_id = await oswService.processSpatialQueryRequest(request.body.user_id, requestService);
            response.setHeader('Location', `${JOBS_API_PATH}?job_id=${job_id}`);
            return response.status(202).send(job_id);

        } catch (error) {
            console.error("Error while processing the spatial join request", error);
            if (error instanceof HttpException) {
                response.status(error.status).send(error.message);
                return next(error);
            }
            response.status(500).send("Error while processing the spatial join request");
            next(new HttpException(500, "Error while processing the spatial join request"));
        }
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

            //TODO:: Authorize the request to check user is part of the project group
            if (requestService.source_dataset_id == undefined || requestService.target_dataset_id == undefined) {
                return next(new InputException('required input is empty', response));
            }

            let apiKey = request.headers['x-api-key'];
            //Reject authorization for API key users
            if (apiKey && apiKey !== '') {
                return next(new ForbiddenAccess());
            }

            //Authorize
            let osw = await tdeiCoreService.getDatasetDetailsById(requestService.target_dataset_id);
            var authorized = await Utility.authorizeRoles(request.body.user_id, osw.tdei_project_group_id, ["tdei_admin", "poc", "osw_data_generator"]);
            if (!authorized) {
                return next(new ForbiddenAccess());
            }

            let backendRequest: TagRoadServiceRequest = {
                user_id: request.body.user_id,
                service: "dataset_tag_road",
                parameters: {
                    source_dataset_id: requestService.source_dataset_id,
                    target_dataset_id: requestService.target_dataset_id
                }
            }

            let job_id = await oswService.processDatasetTagRoadRequest(backendRequest);
            response.setHeader('Location', `${JOBS_API_PATH}?job_id=${job_id}`);
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
            documentation: environment.schemaDocumentationUrl as string ?? '',
            specification: environment.schemaUrl as string ?? '',
            version: "0.3"
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
            let file_version = request.query.file_version as string ?? 'latest';

            if (!["osw", "osm"].includes(format)) {
                throw new InputException("Invalid file format value");
            }

            if (!["latest", "original"].includes(file_version)) {
                throw new InputException("Invalid file_version value");
            }
            const redirectUrl = await oswService.getDownloadableOSWUrl(request.params.id, request.body.user_id, format, file_version);
            response.redirect(redirectUrl);

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

            const file_size_in_bytes = Utility.calculateTotalSize([request.file] as any);
            //if file size greater than 1GB then throw error
            if (file_size_in_bytes > ONE_GB_IN_BYTES) {
                throw new HttpException(400, `The total size of dataset zip files exceeds 1 GB upload limit.`);
            }


            let job_id = await oswService.processValidationOnlyRequest(request.body.user_id, datasetFile);
            response.setHeader('Location', `${JOBS_API_PATH}?job_id=${job_id}`);
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

            response.setHeader('Location', `${JOBS_API_PATH}?job_id=${job_id}`);
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
            if (!requestService || !requestService.tdei_dataset_id || !requestService.bbox) {
                //return which input is missing
                return next(new InputException('required input is empty', response));
            }

            if (!Array.isArray(requestService.bbox)) {
                if (typeof requestService.bbox === 'string') {
                    requestService.bbox = requestService.bbox.split(',').map(Number);
                }

                if (!Array.isArray(requestService.bbox) || requestService.bbox.length !== 4) {
                    throw new InputException('bbox should be an array of 4 elements', response);
                }
            }

            let backendRequest: BboxServiceRequest = {
                user_id: request.body.user_id,
                service: "bbox_intersect",
                parameters: {
                    tdei_dataset_id: requestService.tdei_dataset_id,
                    bbox: requestService.bbox
                }
            }

            let job_id = await oswService.processBboxRequest(backendRequest, requestService.file_type);
            response.setHeader('Location', `${JOBS_API_PATH}?job_id=${job_id}`);
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

            const file_size_in_bytes = Utility.calculateTotalSize(uploadRequest.datasetFile);
            //if file size greater than 1GB then throw error
            if (file_size_in_bytes > ONE_GB_IN_BYTES) {
                throw new HttpException(400, `The total size of dataset zip files exceeds 1 GB upload limit.`);
            }

            if (!uploadRequest.metadataFile) {
                console.error("metadata file input upload missing");
                response.status(400).send("metadata file input upload missing");
                return next(new InputException("metadata file input upload missing"));
            }

            let job_id = await oswService.processUploadRequest(uploadRequest);
            response.setHeader('Location', `${JOBS_API_PATH}?job_id=${job_id}`);
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
            const subRegionFile = request.file;
            let tdei_dataset_id = request.params["tdei_dataset_id"];
            if (tdei_dataset_id == undefined) {
                response.status(400).send('Please add tdei_dataset_id in payload')
                return next()
            }

            if (subRegionFile) {
                const metadata = JSON.parse(subRegionFile.buffer as any);
                const valid = validatePolygonGeojson(metadata);
                if (!valid) {
                    let requiredMsg = validatePolygonGeojson.errors?.filter(z => z.keyword == "required").map((error: ErrorObject) => `${error.params.missingProperty}`).join(", ");
                    let additionalMsg = validatePolygonGeojson.errors?.filter(z => z.keyword == "additionalProperties").map((error: ErrorObject) => `${error.params.additionalProperty}`).join(", ");
                    requiredMsg = requiredMsg != "" ? "Required properties : " + requiredMsg + " missing" : "";
                    additionalMsg = additionalMsg != "" ? "Additional properties found : " + additionalMsg + " not allowed" : "";
                    console.error("Sub region geojson schema validation error : ", additionalMsg, requiredMsg);
                    response.status(400).send('Sub region geojson schema validation error')
                    return next(new InputException((requiredMsg + "\n" + additionalMsg) as string));
                }
            }


            let job_id = await oswService.calculateConfidence(tdei_dataset_id, subRegionFile, request.body.user_id);
            response.setHeader('Location', `${JOBS_API_PATH}?job_id=${job_id}`);
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

            const file_size_in_bytes = Utility.calculateTotalSize([request.file] as any);
            //if file size greater than 1GB then throw error
            if (file_size_in_bytes > ONE_GB_IN_BYTES) {
                throw new HttpException(400, `The total size of dataset zip files exceeds 1 GB upload limit.`);
            }

            let source = request.body['source_format']; //TODO: Validate the input enums 
            let target = request.body['target_format'];

            if (!["osw", "osm"].includes(target) || !["osw", "osm"].includes(source)) {
                throw new InputException("Invalid source/target value");
            }

            if (source == undefined || target == undefined) {
                throw new InputException("Missing source/target input");
            }

            if (source == target) {
                throw new InputException("Source and Target value cannot be same");
            }

            let job_id = await oswService.processFormatRequest(source, target, uploadedFile, request.body.user_id);
            response.setHeader('Location', `${JOBS_API_PATH}?job_id=${job_id}`);
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

    createIXNQualityOnDemandRequest = async (request: Request, response: express.Response, next: NextFunction) => {
        try {
            let tdei_dataset_id = request.params["tdei_dataset_id"];
            const subRegionFile = request.file;
            // Algorithm is ixn
            let algorithms = 'ixn';
            // let persist = request.body.persist;
            if (tdei_dataset_id == undefined) {
                throw new InputException("Missing tdei_dataset_id input")
            }
            // if (tdei_dataset_id == undefined || algorithms == undefined) {
            //     throw new InputException("Please add tdei_dataset_id, algorithm in payload")
            // }
            let job_id = await oswService.calculateQualityMetric(tdei_dataset_id, algorithms, subRegionFile, request.body.user_id);
            response.setHeader('Location', `${JOBS_API_PATH}?job_id=${job_id}`);
            return response.status(202).send(job_id);

        } catch (error) {
            console.error("Error while processing the quality metric request", error);
            if (error instanceof HttpException) {
                response.status(error.status).send(error.message);
                return next(error);
            }
            response.status(500).send("Error while processing the quality metric");
            next(new HttpException(500, "Error while processing the quality metric"));
        }
    }

    /**
     * Creates a quality report job for a single dataset.
     * POST /api/v1/osw/quality-report/:tdei_dataset_id
     */
    createQualityReportJob = async (request: Request, response: express.Response, next: NextFunction) => {
        try {
            const tdei_dataset_id = request.params["tdei_dataset_id"];
            if (tdei_dataset_id == undefined) {
                throw new InputException("Missing tdei_dataset_id input");
            }
            const tdei_api_key = request.headers['x-api-key'] as string | undefined;
            const username = request.body.username as string | undefined;
            const tdei_auth_token = request.headers['authorization'] as string | undefined;
            const job_id = await oswService.createQualityReportJob(tdei_dataset_id, request.body.user_id, tdei_api_key, username, tdei_auth_token);
            response.setHeader('Location', `${JOBS_API_PATH}?job_id=${job_id}`);
            return response.status(202).send(job_id);
        } catch (error) {
            console.error("Error while creating quality report job", error);
            if (error instanceof HttpException) {
                response.status(error.status).send(error.message);
                return next(error);
            }
            response.status(500).send("Error while creating quality report job");
            next(new HttpException(500, "Error while creating quality report job"));
        }
    }


    /**
     * Request to calculate the inclination for the given dataset
     * @param request 
     * @param response 
     * @param next 
     * @returns 
     */
    createInclineRequest = async (request: Request, response: express.Response, next: NextFunction) => {
        try {
            const tdei_dataset_id = request.params["tdei_dataset_id"];
            if (tdei_dataset_id == undefined) {
                throw new InputException("Missing tdei_dataset_id input")
            }

            let apiKey = request.headers['x-api-key'];
            //Reject authorization for API key users
            if (apiKey && apiKey !== '') {
                return next(new ForbiddenAccess());
            }

            //Authorize
            let osw = await tdeiCoreService.getDatasetDetailsById(tdei_dataset_id);
            var authorized = await Utility.authorizeRoles(request.body.user_id, osw.tdei_project_group_id, ["tdei_admin", "poc", "osw_data_generator"]);
            if (!authorized) {
                return next(new ForbiddenAccess());
            }

            let backendRequest: InclinationServiceRequest = {
                user_id: request.body.user_id,
                service: "add_inclination",
                parameters: {
                    dataset_id: tdei_dataset_id
                }
            }

            let job_id = await oswService.calculateInclination(backendRequest);
            response.setHeader('Location', `${JOBS_API_PATH}?job_id=${job_id}`);
            return response.status(202).send(job_id);
        } catch (error) {
            console.error("Error while processing the incline dataset request", error);
            if (error instanceof HttpException) {
                response.status(error.status).send(error.message);
                return next(error);
            }
            response.status(500).send("Error while processing the incline dataset request");
            next(new HttpException(500, "Error while processing the incline dataset request"));
        }
    }
}

const oswController = new OSWController();
export default oswController;