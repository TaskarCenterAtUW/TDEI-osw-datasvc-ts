import { Core } from "nodets-ms-core";
import { FileEntity } from "nodets-ms-core/lib/core/storage";
import { QueryConfig } from "pg";
import dbClient from "../database/data-source";
import HttpException from "../exceptions/http/http-base-exception";
import { IJobService } from "./interface/job-service-interface";
import { JobsQueryParams } from "../model/jobs-get-query-params";
import { CreateJobDTO, JobDTO, UpdateJobDTO } from "../model/job-dto";
import { JobEntity } from "../database/entity/job-entity";
import { Utility } from "../utility/utility";
import { InputException } from "../exceptions/http/http-exceptions";

class JobService implements IJobService {
    constructor() { }

    /**
     * Retrieves a list of jobs based on the provided query parameters.
     * @param user_id user_id.
     * @param params The query parameters used to filter the jobs.
     * @returns A promise that resolves to an array of JobDTO objects.
     */
    async getJobs(user_id: string, params: JobsQueryParams): Promise<JobDTO[]> {

        const queryObject = params.getQuery(user_id);

        const queryConfig = <QueryConfig>{
            text: queryObject.text,
            values: queryObject.values
        }
        const result = await dbClient.query(queryConfig);

        const list: JobDTO[] = [];
        result.rows.map(x => {
            const job = JobDTO.from(x);
            job.download_url = job.download_url ? `/job/download/${job.job_id}` : ''; // do not share internal upload URL
            job.progress = {
                total_stages: x['total_workflow_tasks'],
                current_stage:  x['current_task_description'],
                completed_stages: x['tasks_track_number'],
                current_state: x['current_task_status'],
                current_stage_percent_done: 0,
                last_updated_at: x['last_updated_at']
            }
            if(job.status === 'FAILED') {
                job.message = x['current_task_error'];
            }
            job.current_stage = x['current_task_description'];
            job.updated_at = x['last_updated_at'];
            list.push(job);
        });
      
        return Promise.resolve(list);
    }

    /**
     * Retrieves the FileEntity associated with the given job ID.
     * @param job_id The ID of the job.
     * @returns A Promise that resolves to the FileEntity.
     * @throws HttpException if the file is not found.
     * @throws Error if the storage is not configured.
     */
    async getJobFileEntity(job_id: string): Promise<FileEntity> {

        const result = await dbClient.query(JobEntity.getJobByIdQuery(job_id));

        if (result.rowCount == 0)
            throw new InputException("Job not found");

        if (result.rows[0].download_url == null || result.rows[0].download_url == '')
            throw new HttpException(404, "Download not available for this job.");

        let url = decodeURIComponent(result.rows[0].download_url);

        const storageClient = Core.getStorageClient();
        if (storageClient == null) throw new Error("Storage not configured");

        let fileEntity = await storageClient.getFileFromUrl(url);
        const extension = url.split('.').pop();
        // Check if the extension is one of the expected types
        if (['txt', 'json', 'zip', 'xml'].includes(extension!)) {
            const mimeType = Utility.getMimeType(extension!);
            fileEntity.mimeType = mimeType;
        } else {
            console.log('Unexpected file type');
        }
        return fileEntity;
    }

    /**
     * Creates a job in the database.
     * @param job - The job object containing the job details.
     * @returns A Promise that resolves to the job ID of the created job.
     */
    async createJob(job: CreateJobDTO): Promise<Number> {
        const result = await dbClient.query(JobEntity.getCreateJobQuery(job));
        return result.rows[0].job_id;
    }

    /**
     * Updates a job with the given parameters.
     * 
     * @param job_id - The ID of the job to update.
     * @param status - The new status of the job.
     * @param message - The message associated with the job update.
     * @param response_props - The response properties of the job update.
     * @param download_url - The download URL associated with the job update.
     * @returns A promise that resolves to updated job object.
     */
    async updateJob(updateJobDTO: UpdateJobDTO): Promise<JobDTO> {
        var response_exists = updateJobDTO.response_props && Object.keys(updateJobDTO.response_props).length > 0 ? true : false;
        var download_exists = updateJobDTO.download_url && updateJobDTO.download_url != "" ? true : false;
        let jobDetail = await dbClient.query(JobEntity.getJobByIdQuery(updateJobDTO.job_id.toString()));
        if (jobDetail.rows.length) {
            // update the response_props with the existing response_props
            updateJobDTO.response_props = response_exists ? { ...jobDetail.rows[0].response_props, ...updateJobDTO.response_props } : jobDetail.rows[0].response_props;
            updateJobDTO.download_url = download_exists ? updateJobDTO.download_url : jobDetail.rows[0].download_url;
        }

        let result = await dbClient.query(JobEntity.getUpdateJobQuery(updateJobDTO));
        let updatedJob = JobDTO.from(result.rows[0]);
        return updatedJob;
    }

    /**
     * Updates the response properties of a job.
     * 
     * @param job_id - The ID of the job.
     * @param response_props - The new response properties to be updated.
     * @returns A Promise that resolves to void.
     */
    async updateJobResponseProps(job_id: string, response_props: any): Promise<void> {
        var response_exists = response_props && Object.keys(response_props).length > 0 ? true : false;
        if (response_exists) {
            let jobDetail = await dbClient.query(JobEntity.getJobByIdQuery(job_id));
            if (jobDetail.rows.length) {
                // update the response_props with the existing response_props
                response_props = { ...jobDetail.rows[0].response_props, ...response_props };
            }
        }
        await dbClient.query(JobEntity.getUpdateJobResponsePropsQuery(job_id, response_props));
    }
}

const jobService: IJobService = new JobService();

export default jobService;

