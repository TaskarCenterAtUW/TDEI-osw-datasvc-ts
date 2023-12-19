import { IsNotEmpty } from 'class-validator';
import { Prop } from 'nodets-ms-core/lib/models';
import { QueryConfig } from 'pg';
import { BaseDto } from '../../model/base-dto';

export class OswValidationJobs extends BaseDto {

    @Prop()
    job_id!: number;
    @Prop()
    @IsNotEmpty()
    validation_result!: string;
    @Prop()
    @IsNotEmpty()
    upload_url!: string;
    @Prop()
    @IsNotEmpty()
    status!: string;
    @Prop()
    created_at!: Date;
    @Prop()
    updated_at!: Date;

    constructor(init?: Partial<OswValidationJobs>) {
        super();
        Object.assign(this, init);
    }

    getInsertQuery(): QueryConfig {

        const queryObject = {
            text: `INSERT INTO public.osw_validation_jobs(
                upload_url,
                status
            ) VALUES($1, $2)`.replace(/\n/g, ""),
            values: [this.upload_url, this.status]
        }
        return queryObject;
    }

    static updateStatusQuery(job_id: string, status: string, validation_result: string): QueryConfig {
        const queryObject = {
            text: `UPDATE public.osw_validation_jobs SET status = $1, validation_result = $2, updated_at = CURRENT_TIMESTAMP
            WHERE job_id = $3`,
            values: [status, validation_result, job_id]
        }
        return queryObject;
    }
}