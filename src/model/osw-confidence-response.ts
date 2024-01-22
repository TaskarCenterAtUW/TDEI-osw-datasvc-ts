import { IsNotEmpty, isNotEmpty } from "class-validator";
import { AbstractDomainEntity, Prop } from "nodets-ms-core/lib/models";
import { QueryConfig } from "pg";
import { Utility } from "../utility/utility";

/**
 * Class that holds data response from the confidence metric service
 * Eg.
 * {
    jobId: '22',
    confidence_level: '90.0',
    confidence_library_version: 'v1.0',
    status: 'finished',
    message: 'Processed successfully'
  }
 */
export class OSWConfidenceResponse extends AbstractDomainEntity {

    @Prop()
    @IsNotEmpty()
    jobId!: string

    @Prop()
    @IsNotEmpty()
    confidence_level!: string

    @Prop()
    @IsNotEmpty()
    confidence_library_version!: string

    @Prop()
    @IsNotEmpty()
    status!: string

    @Prop()
    message: string = ''

    constructor(init?: Partial<OSWConfidenceResponse>) {
        super();
        Object.assign(this, init);
    }

    getUpdateJobQuery(): QueryConfig {
        // The query returns the tdei_record_id and confidence metric
        const queryObject = {
            text: `UPDATE public.osw_confidence_jobs SET status = $1, 
            confidence_metric = $2, 
            cm_version = $3,
            cm_last_calculated_at = $4
            WHERE jobid = $5 RETURNING tdei_record_id,confidence_metric`,
            values: [this.status, this.confidence_level, this.confidence_library_version, Utility.getUTCDate(), this.jobId]
        }
        return queryObject;
    }

    getRecordUpdateQuery(tdei_record_id: string): QueryConfig {
        const queryObject = {
            text: `UPDATE public.osw_versions SET 
            confidence_level = $1,
            cm_version= $2, 
            cm_last_calculated_at=$3,
            updated_at= CURRENT_TIMESTAMP  
            WHERE 
            tdei_record_id=$4 
            RETURNING tdei_record_id`,
            values: [this.confidence_level, this.confidence_library_version, Utility.getUTCDate(), tdei_record_id]
        }
        return queryObject;
    }
}