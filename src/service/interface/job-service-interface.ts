import { FileEntity } from "nodets-ms-core/lib/core/storage";
import { CreateJobDTO, JobDTO } from "../../model/job-dto";
import { JobsQueryParams } from "../../model/jobs-get-query-params";

export interface IJobService {
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
    createJob(job: CreateJobDTO): Promise<Number>;
}