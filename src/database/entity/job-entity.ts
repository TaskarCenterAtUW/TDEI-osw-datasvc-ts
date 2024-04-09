import { IsNotEmpty } from 'class-validator';
import { Prop } from 'nodets-ms-core/lib/models';
import { QueryConfig } from 'pg';
import { BaseDto } from '../../model/base-dto';
import { JobStatus, JobType, TDEIDataType } from '../../model/jobs-get-query-params';
import { CreateJobDTO } from '../../model/job-dto';
import { buildUpdateQuery } from '../dynamic-update-query';
import { TdeiDate } from '../../utility/tdei-date';

export class JobEntity extends BaseDto {
    [key: string]: any;//This is to allow dynamic properties
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
    @Prop()
    stage!: string;

    constructor(init?: Partial<JobEntity>) {
        super();
        Object.assign(this, init);
    }

    /**
     * Generates an dynamic update query for a job entity.
     * @param job_id - The ID of the job. Where clause.
     * @param fields - The fields to update in the job entity.
     * @returns The update query configuration.
     */
    static getUpdateQuery(job_id: string, fields: JobEntity): QueryConfig {
        const dataToUpdate: any = {};

        for (const key in fields) {
            if (fields.hasOwnProperty(key) && fields[key] !== undefined) {
                dataToUpdate[key] = fields[key];
            }
        }

        dataToUpdate.updated_at = TdeiDate.UTC();

        const whereCondition = {
            job_id: job_id,
        };

        const query = buildUpdateQuery('content.job', dataToUpdate, whereCondition);

        return query;
    }

    /**
     * Returns the query configuration for creating a job in the database.
     * @param job - The job object containing the necessary data for creating a job.
     * @returns The query configuration object.
     */
    static getCreateJobQuery(job: CreateJobDTO): QueryConfig {
        const query = {
            text: 'INSERT INTO content.job (job_type, data_type, status, user_id, tdei_project_group_id, request_input, response_props , stage) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING job_id',
            values: [job.job_type, job.data_type, job.status, job.user_id, job.tdei_project_group_id, job.request_input, job.response_props, job.stage],
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