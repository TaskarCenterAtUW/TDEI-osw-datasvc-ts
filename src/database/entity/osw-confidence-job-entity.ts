/**
 * Class that deals with insert/update of the confidence job
 */
import { BaseDto } from '../../model/base-dto';
import { Prop } from 'nodets-ms-core/lib/models';
import { IsNotEmpty, IsOptional } from 'class-validator';
import { QueryConfig } from 'pg';

export class OswConfidenceJob extends BaseDto {

    @Prop()
    jobId!: number;
    @Prop()
    @IsNotEmpty()
    tdei_record_id!: string;
    @Prop()
    confidence_metric = 0;
    @Prop()
    trigger_type!: string;
    @Prop()
    @IsNotEmpty()
    created_at!: Date;
    @Prop()
    @IsNotEmpty()
    updated_at!: Date;
    @Prop()
    @IsNotEmpty()
    status!:string;
    @Prop()
    @IsOptional()
    user_id:string = '';
    @Prop()
    cm_version!:string;
    @Prop()
    cm_last_calculated_at!: Date;

    constructor(init?: Partial<OswConfidenceJob>) {
        super();
        Object.assign(this, init);
    }

    getInsertQuery(): QueryConfig {
        // const polygonExists = this.polygon ? true : false;
        const queryObject = {
            text: `INSERT INTO public.osw_confidence_jobs(
                tdei_record_id, 
                confidence_metric, 
                trigger_type, 
                created_at, 
                updated_at,
                status, 
                user_id,
                cm_version, 
                cm_last_calculated_at)
                VALUES ($1,0,$2,$3,$4,$5,$6,$7,$8) RETURNING *`.replace(/\n/g, ""),
            values: [this.tdei_record_id, this.trigger_type, this.created_at, this.updated_at
                , this.status, this.user_id, this.cm_version, this.cm_last_calculated_at],
        }
        
        return queryObject;
    }

}
