import { NextFunction, Request } from "express";
import express from "express";
import { IController } from "./interface/IController";
import HttpException from "../exceptions/http/http-base-exception";
import { FileTypeException, InputException, UnAuthenticated } from "../exceptions/http/http-exceptions";
import { authenticate } from "../middleware/authenticate-middleware";
import { JobsQueryParams, TDEIDataType, TDEIRole } from "../model/jobs-get-query-params";
import jobService from "../service/job-service";
import tdeiCoreService from "../service/tdei-core-service";
import { authorize } from "../middleware/authorize-middleware";
import { DatasetQueryParams } from "../model/dataset-get-query-params";
import multer, { memoryStorage } from "multer";
import path from "path";
import { Utility } from "../utility/utility";
import { IDatasetCloneRequest } from "../model/request-interfaces";


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
        this.router.delete(`${this.path}/dataset/:tdei_dataset_id`, authenticate, authorize(["tdei_admin", "poc"]), this.invalidateRecordRequest);
        this.router.get(`${this.path}/jobs`, authenticate, this.getJobs);
        this.router.get(`${this.path}/datasets`, authenticate, this.getDatasetList);
        this.router.get(`${this.path}/job/download/:job_id`, authenticate, this.getJobDownloadFile); // Download the formatted file
        this.router.put(`${this.path}/metadata/:tdei_dataset_id`, metadataUpload.single('file'), authenticate,
            async (req, res, next) => {
                let datasetRecord = await tdeiCoreService.getDatasetDetailsById(req.params["tdei_dataset_id"]);
                req.params["tdei_data_type"] = datasetRecord.data_type;
                if (datasetRecord.data_type === TDEIDataType.osw) {
                    authorize([TDEIRole["tdei-admin"], TDEIRole.poc, TDEIRole.osw_data_generator])(req, res, next);
                } else if (datasetRecord.data_type === TDEIDataType.flex) {
                    authorize([TDEIRole["tdei-admin"], TDEIRole.poc, TDEIRole.flex_data_generator])(req, res, next);
                } else if (datasetRecord.data_type === TDEIDataType.pathways) {
                    authorize([TDEIRole["tdei-admin"], TDEIRole.poc, TDEIRole.pathways_data_generator])(req, res, next);
                }
            }, this.editMetadata); // edit Metadata request
        this.router.post(`${this.path}/dataset/clone/:tdei_dataset_id/:tdei_project_group_id/:tdei_service_id`, metadataUpload.single('file'), authenticate, async (req, res, next) => {
            let datasetRecord = await tdeiCoreService.getDatasetDetailsById(req.params["tdei_dataset_id"]);
            if (datasetRecord)
                req.params["tdei_data_type"] = datasetRecord.data_type;
            if (datasetRecord.data_type === TDEIDataType.osw) {
                authorize([TDEIRole["tdei-admin"], TDEIRole.poc, TDEIRole.osw_data_generator])(req, res, next);
            } else if (datasetRecord.data_type === TDEIDataType.flex) {
                authorize([TDEIRole["tdei-admin"], TDEIRole.poc, TDEIRole.flex_data_generator])(req, res, next);
            } else if (datasetRecord.data_type === TDEIDataType.pathways) {
                authorize([TDEIRole["tdei-admin"], TDEIRole.poc, TDEIRole.pathways_data_generator])(req, res, next);
            }
        }, this.cloneDataset); // clone Dataset request
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

            let cloned_dataset_id = await tdeiCoreService.cloneDataset(datasetCloneRequestObject);
            return response.status(200).send(cloned_dataset_id);

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

            await tdeiCoreService.editMetadata(request.params["tdei_dataset_id"], metafile, request.body.user_id, request.params["tdei_data_type"] as TDEIDataType);
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
     * Gives the downloadable stream for the job
     * @param request 
     * @param response 
     * @param next 
     * @returns 
     */
    getJobDownloadFile = async (request: Request, response: express.Response, next: NextFunction) => {
        try {
            const job_id = request.params['job_id'];

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