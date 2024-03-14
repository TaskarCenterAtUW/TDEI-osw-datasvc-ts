import { NextFunction, Request } from "express";
import express from "express";
import { IController } from "./interface/IController";
import HttpException from "../exceptions/http/http-base-exception";
import { InputException } from "../exceptions/http/http-exceptions";
import { authenticate } from "../middleware/authenticate-middleware";
import { JobsQueryParams } from "../model/jobs-get-query-params";
import jobService from "../service/job-service";
import { DatasetQueryParams } from "../model/dataset-get-query-params";
import tdeiCoreService from "../service/tdei-core-service";


class GeneralController implements IController {
    public path = '/api/v1';
    public router = express.Router();
    constructor() {
        this.intializeRoutes();
    }

    public intializeRoutes() {
        this.router.get(this.path, authenticate, this.getDatasetList);
        this.router.get(`${this.path}/job`, authenticate, this.getJobs);
        this.router.get(`${this.path}/job/download/:job_id`, authenticate, this.getJobDownloadFile); // Download the formatted file
    }

    /**
    * Gets the list of OSW versions
    * @param request 
    * @param response 
    * @param next 
    */
    getDatasetList = async (request: Request, response: express.Response, next: NextFunction) => {
        try {
            const params: DatasetQueryParams = new DatasetQueryParams(JSON.parse(JSON.stringify(request.query)));
            params.isAdmin = request.body.isAdmin;
            const osw = await tdeiCoreService.getDatasets(request.body.user_id, params);
            osw.forEach(x => {
                x.download_url = `${this.path}/${x.tdei_dataset_id}`;
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

            const validation_message = await tdeiCoreService.validateObject<JobsQueryParams>(params);

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

            response.setHeader('Content-Type', 'application/zip');
            response.setHeader('Content-Disposition', `attachment; filename=${fileEntity.fileName}`);
            (await fileEntity.getStream()).pipe(response);

        } catch (error) {
            console.error("Error while processing the download request", error);
            return next(error);
        }
    }

}

const generalController = new GeneralController();
export default generalController;