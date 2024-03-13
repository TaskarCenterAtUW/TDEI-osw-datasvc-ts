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
    @Prop()
    requested_by!: Date;

    constructor(init?: Partial<OswValidationJobs>) {
        super();
        Object.assign(this, init);
    }

    getInsertQuery(): QueryConfig {

        const queryObject = {
            text: `INSERT INTO content.validation_job(
                upload_url,
                status,
                requested_by
            ) VALUES($1, $2, $3) RETURNING *`.replace(/\n/g, ""),
            values: [this.upload_url, this.status, this.requested_by]
        }
        return queryObject;
    }

    static getUpdateStatusQuery(job_id: string, status: string, validation_result: string): QueryConfig {
        const queryObject = {
            text: `UPDATE content.validation_job SET status = $1, validation_result = $2, updated_at = CURRENT_TIMESTAMP
            WHERE job_id = $3`,
            values: [status, validation_result, job_id]
        }
        return queryObject;
    }
}