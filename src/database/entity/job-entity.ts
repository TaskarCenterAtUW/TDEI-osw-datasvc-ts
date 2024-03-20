import { IsNotEmpty } from 'class-validator';
import { Prop } from 'nodets-ms-core/lib/models';
import { QueryConfig } from 'pg';
import { BaseDto } from '../../model/base-dto';
import { JobStatus, JobType, TDEIDataType } from '../../model/jobs-get-query-params';
import { CreateJobDTO, UpdateJobDTO } from '../../model/job-dto';

export class JobEntity extends BaseDto {
    @Prop()
    job_id!: number;
    @Prop()
    data_type!: TDEIDataType;
    @Prop()
    @IsNotEmpty()
    status: string = JobStatus["IN-PROGRESS"];
    @Prop()
    @IsNotEmpty()
    message!: string;
    @Prop()
    @IsNotEmpty()
    request_input!: any;
    @Prop()
    @IsNotEmpty()
    tdei_project_group_id!: string;
    @Prop()
    @IsNotEmpty()
    user_id!: string;
    @Prop()
    @IsNotEmpty()
    job_type!: JobType;
    @Prop()
    response_props!: any;
    @Prop()
    download_url!: string;
    @Prop()
    created_at!: string;
    @Prop()
    updated_at!: string;

    constructor(init?: Partial<JobEntity>) {
        super();
        Object.assign(this, init);
    }

    /**
     * Generates a query configuration object for updating a job in the database.
     * @param updateJobDTO - The DTO containing the updated job information.
     * @returns The query configuration object.
     */
    static getUpdateJobQuery(updateJobDTO: UpdateJobDTO): QueryConfig {
        const query = {
            text: 'UPDATE content.job SET status = $1, message = $2, response_props = $3, download_url = $4, updated_at = CURRENT_TIMESTAMP WHERE job_id = $5 RETURNING *',
            values: [updateJobDTO.status, updateJobDTO.message, updateJobDTO.response_props, updateJobDTO.download_url, updateJobDTO.job_id],
        }
        return query;
    }

    /**
     * Returns the query configuration for creating a job in the database.
     * @param job - The job object containing the necessary data for creating a job.
     * @returns The query configuration object.
     */
    static getCreateJobQuery(job: CreateJobDTO): QueryConfig {
        const query = {
            text: 'INSERT INTO content.job (job_type, data_type, status, user_id, tdei_project_group_id, request_input ) VALUES ($1, $2, $3, $4, $5, $6) RETURNING job_id',
            values: [job.job_type, job.data_type, job.status, job.user_id, job.tdei_project_group_id, job.request_input],
        }
        return query;
    }

    /**
     * Generates a query configuration object for updating the download URL of a job.
     * @param job_id - The ID of the job to update.
     * @param download_url - The new download URL for the job.
     * @returns The query configuration object.
     */
    static getUpdateJobDownloadUrlQuery(job_id: string, download_url: string): QueryConfig {
        const query = {
            text: 'UPDATE content.job SET download_url = $1, updated_at = CURRENT_TIMESTAMP WHERE job_id = $2',
            values: [download_url, job_id],
        }
        return query;
    }

    /**
     * Retrieves a query configuration object for fetching a job's download URL by its ID.
     * @param job_id - The ID of the job.
     * @returns The query configuration object.
     */
    static getJobByIdQuery(job_id: string): QueryConfig {
        const query = {
            text: 'Select * from content.job WHERE job_id = $1',
            values: [job_id],
        }
        return query;
    }
}