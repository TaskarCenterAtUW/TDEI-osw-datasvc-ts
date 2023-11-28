import { Prop } from "nodets-ms-core/lib/models";
import { BaseDto } from "../../model/base-dto";
import { IsNotEmpty, IsOptional } from "class-validator";
import { QueryConfig } from "pg";


/**
 * Database entity class that represents one row in the `osw_formatting_jobs` 
 * table
 */
export class OswFormatJob extends BaseDto {

    @Prop()
    jobId!: number;
    @Prop()
    @IsNotEmpty()
    source!: string;
    @Prop()
    @IsNotEmpty()
    target!: string;
    @Prop()
    @IsNotEmpty()
    status!: string;
    @Prop()
    @IsNotEmpty()
    source_url!: string;
    @Prop()
    @IsOptional()
    target_url: string = ''
    @Prop()
    message: string = ''
    @Prop()
    created_at!: Date;

    constructor(init?: Partial<OswFormatJob>){
        super();
        Object.assign(this,init);
    }

    getInsertQuery(): QueryConfig {

        const queryObject = {
            text:`INSERT INTO public.osw_formatting_jobs(
                source,
                target,
                status,
                source_url,
                target_url,
                message,
                created_at
            ) VALUES($1, $2, $3, $4, '','',$5) RETURNING *`.replace(/\n/g,""),
            values:[this.source, this.target, this.status, this.source_url,this.created_at]
        }
        return queryObject;
    }

    static getUpdateStatusQuery(jobId:string ,status:string, target_url:string, message:string): QueryConfig {
        const queryObject = {
            text:`UPDATE public.osw_formatting_jobs SET status = $1, target_url = $2, message = $3
            WHERE jobid = $4`,
            values: [status, target_url, message, jobId]
        }
        return queryObject;
    }
}