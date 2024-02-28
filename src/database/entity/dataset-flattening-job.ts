import { IsNotEmpty } from 'class-validator';
import { Prop } from 'nodets-ms-core/lib/models';
import { QueryConfig } from 'pg';
import { BaseDto } from '../../model/base-dto';

export class DatasetFlatteningJob extends BaseDto {
    @Prop()
    tdei_dataset_id!: string;
    @Prop()
    job_id!: number;
    @Prop()
    @IsNotEmpty()
    message!: string;
    @Prop()
    @IsNotEmpty()
    status!: string;
    @Prop()
    created_at!: Date;
    @Prop()
    updated_at!: Date;
    @Prop()
    requested_by!: Date;

    constructor(init?: Partial<DatasetFlatteningJob>) {
        super();
        Object.assign(this, init);
    }

    getInsertQuery(): QueryConfig {

        const queryObject = {
            text: `INSERT INTO content.dataset_flattern_job(
                requested_by,
                tdei_dataset_id,
                status
            ) VALUES($1, $2, $3) RETURNING *`.replace(/\n/g, ""),
            values: [this.requested_by, this.tdei_dataset_id, this.status]
        }
        return queryObject;
    }

    static getUpdateStatusQuery(job_id: string, status: string, meessage: string): QueryConfig {
        const queryObject = {
            text: `UPDATE content.dataset_flattern_job SET status = $1, message = $2, updated_at = CURRENT_TIMESTAMP
            WHERE job_id = $3`,
            values: [status, meessage, job_id]
        }
        return queryObject;
    }
}