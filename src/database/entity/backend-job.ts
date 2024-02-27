import { IsNotEmpty } from 'class-validator';
import { Prop } from 'nodets-ms-core/lib/models';
import { QueryConfig } from 'pg';
import { BaseDto } from '../../model/base-dto';

export class BackendJob extends BaseDto {

    @Prop()
    job_id!: number;
    @Prop()
    @IsNotEmpty()
    message!: string;
    @Prop()
    @IsNotEmpty()
    download_url!: string;
    @Prop()
    @IsNotEmpty()
    status!: string;
    @Prop()
    created_at!: Date;
    @Prop()
    updated_at!: Date;
    @Prop()
    requested_by!: Date;

    constructor(init?: Partial<BackendJob>) {
        super();
        Object.assign(this, init);
    }

    getInsertQuery(): QueryConfig {

        const queryObject = {
            text: `INSERT INTO content.backend_job(
                requested_by,
                status
            ) VALUES($1,$2) RETURNING *`.replace(/\n/g, ""),
            values: [this.requested_by, this.status]
        }
        return queryObject;
    }

    static getUpdateStatusQuery(job_id: string, status: string, download_url: string, meessage: string): QueryConfig {
        const queryObject = {
            text: `UPDATE content.backend_job SET status = $1, download_url = $2, message = $3, updated_at = CURRENT_TIMESTAMP
            WHERE job_id = $4`,
            values: [status, download_url, meessage, job_id]
        }
        return queryObject;
    }
}