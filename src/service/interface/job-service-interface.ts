import { FileEntity } from "nodets-ms-core/lib/core/storage";
import { CreateJobDTO, JobDTO, UpdateJobDTO } from "../../model/job-dto";
import { JobsQueryParams } from "../../model/jobs-get-query-params";

export interface IJobService {
    /**
         * Updates the response properties of a job.
         * 
         * @param job_id - The ID of the job.
         * @param response_props - The new response properties to be updated.
         * @returns A Promise that resolves to void.
         */
    updateJobResponseProps(job_id: string, response_props: any): Promise<void>;
    /**
   * Retrieves a list of jobs based on the provided query parameters.
   * @param user_id user_id.
   * @param params The query parameters used to filter the jobs.
   * @returns A promise that resolves to an array of JobDTO objects.
   */
    getJobs(user_id: string, params: JobsQueryParams): Promise<JobDTO[]>;
    /**
    * Retrieves the FileEntity associated with the given job ID.
    * @param job_id The ID of the job.
    * @returns A Promise that resolves to the FileEntity.
    * @throws HttpException if the file is not found.
    * @throws Error if the storage is not configured.
    */
    getJobFileEntity(job_id: string): Promise<FileEntity>;

    /**
     * Creates a job in the database.
     * @param job - The job object containing the job details.
     * @returns A Promise that resolves to the job ID of the created job.
     */
    createJob(job: CreateJobDTO): Promise<number>;

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
    updateJob(updateJobDTO: UpdateJobDTO): Promise<JobDTO>;
}