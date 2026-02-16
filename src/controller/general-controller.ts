import { NextFunction, Request } from "express";
import express from "express";
import { IController } from "./interface/IController";
import HttpException from "../exceptions/http/http-base-exception";
import { FileTypeException, ForbiddenAccess, InputException } from "../exceptions/http/http-exceptions";
import { authenticate } from "../middleware/authenticate-middleware";
import { JobsQueryParams, TDEIDataType, TDEIRole, JobType } from "../model/jobs-get-query-params";
import jobService from "../service/job-service";
import tdeiCoreService from "../service/tdei-core-service";
import { authorize } from "../middleware/authorize-middleware";
import { DatasetQueryParams } from "../model/dataset-get-query-params";
import multer, { memoryStorage } from "multer";
import path from "path";
import { IDatasetCloneRequest } from "../model/request-interfaces";
import { listRequestValidation } from "../middleware/list-request-validation-middleware";
import { metajsonValidator } from "../middleware/metadata-json-validation-middleware";
import { apiTracker } from "../middleware/api-tracker";
import { validate as isUuid } from "uuid";
import validateQueryDto from "../middleware/dto-validation-middleware";
import { JOBS_API_PATH } from "../constants/app-constants";


const acceptedFileFormatsForMetadata = ['.json'];
const metadataUpload = multer({
    dest: 'metadata/',
    storage: memoryStorage(),
    fileFilter: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        if (!acceptedFileFormatsForMetadata.includes(ext)) {
            cb(new FileTypeException());
        }
        cb(null, true);
    }
});

class GeneralController implements IController {

    public path = '/api/v1';
    public router = express.Router();
    constructor() {
        this.intializeRoutes();
    }

    public intializeRoutes() {
        this.router.delete(`${this.path}/dataset/:tdei_dataset_id`, apiTracker, authenticate, authorize(["tdei_admin", "poc"]), this.invalidateRecordRequest);
        this.router.get(`${JOBS_API_PATH}`, apiTracker, authenticate, validateQueryDto(JobsQueryParams), listRequestValidation, this.getJobs);
        this.router.get(`${this.path}/datasets`, apiTracker, authenticate, validateQueryDto(DatasetQueryParams), listRequestValidation, this.getDatasetList);
        this.router.get(`${this.path}/job/download/:job_id`, apiTracker, authenticate, this.getJobDownloadFile); // Download the formatted file
        this.router.put(`${this.path}/metadata/:tdei_dataset_id`, metadataUpload.single('file'), metajsonValidator("edit_metadata"), apiTracker, authenticate,
            async (req, res, next) => {
                try {
                    let datasetRecord = await tdeiCoreService.getDatasetDetailsById(req.params["tdei_dataset_id"]);
                    req.params["tdei_data_type"] = datasetRecord.data_type;
                    if (datasetRecord.data_type === TDEIDataType.osw) {
                        authorize([TDEIRole["tdei-admin"], TDEIRole.poc, TDEIRole.osw_data_generator])(req, res, next);
                    } else if (datasetRecord.data_type === TDEIDataType.flex) {
                        authorize([TDEIRole["tdei-admin"], TDEIRole.poc, TDEIRole.flex_data_generator])(req, res, next);
                    } else if (datasetRecord.data_type === TDEIDataType.pathways) {
                        authorize([TDEIRole["tdei-admin"], TDEIRole.poc, TDEIRole.pathways_data_generator])(req, res, next);
                    }
                } catch (error) {
                    next(error);
                }
            }, this.editMetadata); // edit Metadata request
        this.router.post(`${this.path}/dataset/clone/:tdei_dataset_id/:tdei_project_group_id/:tdei_service_id`, metadataUpload.single('file'), apiTracker, authenticate, async (req, res, next) => {
            try {
                let datasetRecord = await tdeiCoreService.getDatasetDetailsById(req.params["tdei_dataset_id"]);
                req.params["tdei_data_type"] = datasetRecord.data_type;
                if (datasetRecord.data_type === TDEIDataType.osw) {
                    await authorize([TDEIRole["tdei-admin"], TDEIRole.poc, TDEIRole.osw_data_generator])(req, res, next);
                } else if (datasetRecord.data_type === TDEIDataType.flex) {
                    await authorize([TDEIRole["tdei-admin"], TDEIRole.poc, TDEIRole.flex_data_generator])(req, res, next);
                } else if (datasetRecord.data_type === TDEIDataType.pathways) {
                    await authorize([TDEIRole["tdei-admin"], TDEIRole.poc, TDEIRole.pathways_data_generator])(req, res, next);
                }
            } catch (error) {
                next(error);
            }
        }, this.cloneDataset); // clone Dataset request
        this.router.get(`${this.path}/system-metrics`, apiTracker, authenticate, this.getSystemMetrics);
        this.router.get(`${this.path}/data-metrics`, apiTracker, authenticate, this.getDataMetrics);
        this.router.get(`${this.path}/service-metrics/:tdei_project_group_id`, apiTracker, authenticate, this.getServiceMetrics);
        this.router.post(`${this.path}/recover-password`, apiTracker, this.recoverPassword);
        this.router.post(`${this.path}/verify-email`, apiTracker, this.verifyEmail);
        this.router.post(`${this.path}/regenerate-api-key`, apiTracker, authenticate, this.regenerateApiKey);
        this.router.get(`${this.path}/download-stats/export`, apiTracker, authenticate, this.exportDownloadStats);
    }

    /**
     * Exports download stats as CSV stream for admins only.
     * GET /api/v1/download-stats/export
     * Query params: from_date, to_date (ISO8601 strings, optional)
     */
    public exportDownloadStats = async (request: Request, response: express.Response, next: NextFunction) => {
        try {
            if (!request.body.isAdmin)
                throw new ForbiddenAccess();

            const from_date = request.query["from_date"] as string | undefined;
            const to_date = request.query["to_date"] as string | undefined;

            const csvStream = await tdeiCoreService.exportDownloadStatsCSV(from_date, to_date);

            response.setHeader('Content-Type', 'text/csv');
            response.setHeader('Content-Disposition', `attachment; filename="download_stats_${from_date ? from_date + '_' + to_date : 'last_7_days'}.csv"`);
            return csvStream.pipe(response);
        } catch (error) {
            console.error("Error exporting download stats", error);
            if (error instanceof HttpException) {
                response.status(error.status).send(error.message);
                return next(error);
            }
            response.status(500).send("Error exporting download stats");
            next(new HttpException(500, "Error exporting download stats"));
        }
    };

    public regenerateApiKey = async (request: Request, response: express.Response, next: NextFunction) => {
        try {
            //Allow access to only with access token request
            const bearerHeader = request.headers.authorization;
            if (bearerHeader === '' || bearerHeader === undefined)
                throw new ForbiddenAccess();

            if (request.body.username === undefined || request.body.username === "") {
                console.error("Failed fetching username from the api token");
                throw new InputException("Username is required");
            }
            const new_api_key = await tdeiCoreService.regenerateApiKey(request.body.username);
            return response.status(200).send(new_api_key);
        } catch (error) {
            let message = "Error regenerating the API key";
            console.error(message, error);
            if (error instanceof HttpException) {
                response.status(error.status).send(error.message);
                return next(error);
            }
            response.status(500).send(message);
            next(new HttpException(500, message));
        }
    }

    /**
     *   Send the email to the user with the verification link
     * @param request
     * @param response
     * @param next
     */
    public verifyEmail = async (request: Request, response: express.Response, next: NextFunction) => {
        try {
            if (!request.body || request.body == "") {
                throw new InputException("Email is required");
            }
            await tdeiCoreService.verifyEmail(request.body.replace(/['"]+/g, ''));
            return response.status(200).send();
        } catch (error) {
            let message = "Error sending the verification link to provided email.";
            console.error(message, error);
            if (error instanceof HttpException) {
                response.status(error.status).send(error.message);
                return next(error);
            }
            response.status(500).send(message);
            next(new HttpException(500, message));
        }
    }

    /**
     *   Send the email to the user with the password recovery link
     * @param request
     * @param response
     * @param next
     */
    public recoverPassword = async (request: Request, response: express.Response, next: NextFunction) => {
        try {
            if (!request.body || request.body == "") {
                throw new InputException("Email is required");
            }
            await tdeiCoreService.recoverPassword(request.body.replace(/['"]+/g, ''));
            return response.status(200).send();
        } catch (error) {
            let message = "Error sending the password recovery link to provided email.";
            console.error(message, error);
            if (error instanceof HttpException) {
                response.status(error.status).send(error.message);
                return next(error);
            }
            response.status(500).send(message);
            next(new HttpException(500, message));
        }
    }

    /**
     * Get the data metrics
     * @param request
     * @param response
     * @param next
     */
    public getDataMetrics = async (request: Request, response: express.Response, next: NextFunction) => {
        try {
            var result = await tdeiCoreService.getDataMetrics();
            return response.status(200).send(result);
        } catch (error) {
            let errorMessage = "Error fetching the data metrics";
            console.error(errorMessage, error);
            if (error instanceof HttpException) {
                response.status(error.status).send(error.message);
                return next(error);
            }
            response.status(500).send(errorMessage);
            next(new HttpException(500, errorMessage));
        }
    }

    /**
    * Get the system metrics
    * @param request
    * @param response
    * @param next
    */
    public getSystemMetrics = async (request: Request, response: express.Response, next: NextFunction) => {
        try {
            var result = await tdeiCoreService.getSystemMetrics();
            return response.status(200).send(result);

        } catch (error) {
            let errorMessage = "Error fetching the system metrics";
            console.error(errorMessage, error);
            if (error instanceof HttpException) {
                response.status(error.status).send(error.message);
                return next(error);
            }
            response.status(500).send(errorMessage);
            next(new HttpException(500, errorMessage));
        }
    }

    /**
    * Get the service metrics data by project group id
    * @param request
    * @param response
    * @param next
    */
    public getServiceMetrics = async (request: Request, response: express.Response, next: NextFunction) => {
        try {
            const projectGroupId = request.params['tdei_project_group_id']
            // Validate UUID before making a DB call
            if (!isUuid(projectGroupId)) {
                throw new HttpException(400, "Invalid UUID format for project_group_id");
            }
            var result = await tdeiCoreService.getServiceMetrics(projectGroupId);
            return response.status(200).send(result);
        } catch (error: any) {
            let errorMessage = "Error fetching the service metrics";
            // console.error(errorMessage, error);
            if (error instanceof HttpException) {
                response.status(error.status).send(error.message);
                return next(error);
            }
            response.status(500).send(error.message);
            next(new HttpException(500, error.message));
        }
    }

    /**
  * Request to clone the dataset
  * @param request 
  * @param response 
  * @param next 
  */
    cloneDataset = async (request: Request, response: express.Response, next: NextFunction) => {
        try {
            const metafile = request.file;

            let datasetCloneRequestObject: IDatasetCloneRequest = {
                tdei_dataset_id: request.params["tdei_dataset_id"],
                tdei_project_group_id: request.params["tdei_project_group_id"],
                tdei_service_id: request.params["tdei_service_id"],
                user_id: request.body.user_id,
                isAdmin: request.body.isAdmin,
                metafile: metafile
            };

            let clone_result = await tdeiCoreService.cloneDataset(datasetCloneRequestObject);
            response.setHeader('Location', `${JOBS_API_PATH}?job_id=${clone_result.job_id}`);
            return response.status(200).send(clone_result.new_tdei_dataset_id);

        } catch (error) {
            console.error("Error cloning the dataset request", error);
            if (error instanceof HttpException) {
                response.status(error.status).send(error.message);
                return next(error);
            }
            response.status(500).send("Error cloning the dataset request");
            next(new HttpException(500, "Error cloning the dataset request"));
        }
    }

    /**
   * Request edit metadata 
   * @param request 
   * @param response 
   * @param next 
   */
    editMetadata = async (request: Request, response: express.Response, next: NextFunction) => {
        try {
            const metafile = request.file;

            let job_id = await tdeiCoreService.editMetadata(request.params["tdei_dataset_id"], metafile, request.body.user_id, request.params["tdei_data_type"] as TDEIDataType);
            response.setHeader('Location', `${JOBS_API_PATH}?job_id=${job_id}`);
            return response.status(200).send();
        } catch (error) {
            console.error("Error editing the metadata request", error);
            if (error instanceof HttpException) {
                response.status(error.status).send(error.message);
                return next(error);
            }
            response.status(500).send("Error editing the metadata request");
            next(new HttpException(500, "Error editing the metadata request"));
        }
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
            const dataset = await tdeiCoreService.getDatasets(request.body.user_id, params);
            dataset.forEach(x => {
                x.download_url = `${this.path}/${this.getroute(x.data_type)}/${x.tdei_dataset_id}`;
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

    /**
   * Invalidates the tdei record 
   * @param request 
   * @param response 
   * @param next 
   * @returns 
   */
    invalidateRecordRequest = async (request: Request, response: express.Response, next: NextFunction) => {
        try {
            let tdei_dataset_id = request.params["tdei_dataset_id"];
            await tdeiCoreService.invalidateRecordRequest(request.body.user_id, tdei_dataset_id);

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
    * Gets the job details
    * @param request 
    * @param response 
    * @param next 
    * @returns 
    */
    getJobs = async (request: Request, response: express.Response, next: NextFunction) => {

        try {
            const params: JobsQueryParams = new JobsQueryParams(JSON.parse(JSON.stringify(request.query)));
            params.isAdmin = request.body.isAdmin;

            const validation_message = await tdeiCoreService.validateObject(params);

            if (validation_message) {
                return next(new InputException('Input validation failed with below reasons : \n' + validation_message, response));
            }

            if (!params.isAdmin) {
                if (!params.tdei_project_group_id) throw new InputException('tdei_project_group_id is required for non-admin user');
            }

            const jobInfo = await jobService.getJobs(request.body.user_id, params);

            response.status(200).send(jobInfo);
        } catch (error) {
            console.error("Error while gettting the jobs", error);
            if (error instanceof HttpException) {
                response.status(error.status).send(error.message);
                return next(error);
            }
            response.status(500).send("Error while gettting the jobs");
            next(new HttpException(500, "Error while gettting the jobs"));
        }
    }

    /**
     * Gives the downloadable stream for the job.
     * If job type is Quality-Report, redirects to the external download URL.
     * @param request 
     * @param response 
     * @param next 
     * @returns 
     */
    getJobDownloadFile = async (request: Request, response: express.Response, next: NextFunction) => {
        try {
            const job_id = request.params['job_id'];

            const downloadInfo = await jobService.getJobDownloadInfo(job_id);

            if (downloadInfo.job_type === JobType["Quality-Report"]) {
                return response.redirect(downloadInfo.download_url);
            }

            const fileEntity = await jobService.getJobFileEntity(job_id);
            response.setHeader('Content-Type', fileEntity.mimeType);
            response.setHeader('Content-Disposition', `attachment; filename=${fileEntity.fileName}`);
            (await fileEntity.getStream()).pipe(response);

        } catch (error) {
            console.error("Error while processing the download request", error);
            return next(error);
        }
    }

    private getroute(data_type: string) {
        switch (data_type) {
            case 'osw':
                return 'osw';
            case 'pathways':
                return 'gtfs-pathways';
            case 'flex':
                return 'gtfs-flex';
        }
    }

}

const generalController = new GeneralController();
export default generalController;