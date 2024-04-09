import { Core } from "nodets-ms-core";
import { FileEntity } from "nodets-ms-core/lib/core/storage";
import { QueryConfig } from "pg";
import dbClient from "../database/data-source";
import HttpException from "../exceptions/http/http-base-exception";
import { IJobService } from "./interface/job-service-interface";
import { JobsQueryParams } from "../model/jobs-get-query-params";
import { CreateJobDTO, JobDTO } from "../model/job-dto";
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
        result.rows.forEach(x => {
            const job = JobDTO.from(x);
            job.download_url = job.download_url ? `/job/download/${job.job_id}` : ''; // do not share internal upload URL
            list.push(job);
        })
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
}

const jobService: IJobService = new JobService();

export default jobService;

