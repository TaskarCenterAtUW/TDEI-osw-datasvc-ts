import { IsNotEmpty } from 'class-validator';
import { Prop } from 'nodets-ms-core/lib/models';
import { QueryConfig } from 'pg';
import { BaseDto } from '../../model/base-dto';

export class OswVersions extends BaseDto {

    @Prop()
    id!: number;
    @Prop()
    @IsNotEmpty()
    tdei_record_id!: string;
    @Prop()
    @IsNotEmpty()
    tdei_service_id!: string;
    @Prop()
    @IsNotEmpty()
    tdei_project_group_id!: string;
    @Prop()
    derived_from_dataset_id!: string;
    @Prop()
    confidence_level!: number;
    @Prop()
    @IsNotEmpty()
    download_osw_url!: string;
    @Prop()
    download_osm_url!: string;
    @Prop()
    download_changeset_url!: string;
    @Prop()
    download_metadata_url!: string;
    @Prop()
    @IsNotEmpty()
    uploaded_by!: string;
    @Prop()
    cm_version!: string;
    @Prop()
    cm_last_calculated_at!: string;
    @Prop()
    @IsNotEmpty()
    status: string = "Pre-Release";
    @Prop()
    uploaded_timestamp!: Date;
    @Prop()
    updated_at!: string;
    @Prop()
    updated_by!: string;

    constructor(init?: Partial<OswVersions>) {
        super();
        Object.assign(this, init);
    }

    /**
     * Builds the insert QueryConfig object
     * @returns QueryConfig object
     */
    getInsertQuery(): QueryConfig {

        const queryObject = {
            text: `INSERT INTO public.osw_versions(
                tdei_record_id,
                tdei_service_id, 
                tdei_project_group_id,
                download_osw_url,
                uploaded_by, 
                derived_from_dataset_id, 
                status,
                uploaded_timestamp,
                download_changeset_url,
                download_metadata_url,
                updated_by)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`.replace(/\n/g, ""),
            values: [this.tdei_record_id, this.tdei_service_id, this.tdei_project_group_id,
            this.download_osw_url
                , this.uploaded_by,
            this.derived_from_dataset_id ?? null,
            this.status,
            new Date(),
            this.download_changeset_url ?? null,
            this.download_metadata_url,
            this.updated_by]
        }
        return queryObject;
    }


    static getUpdateFormatUrlQuery(tdei_record_id: string, download_osm_url: string): QueryConfig {
        const queryObject = {
            text: `UPDATE public.osw_versions SET download_osm_url = $1 , updated_at = CURRENT_TIMESTAMP 
            WHERE tdei_record_id = $2`,
            values: [download_osm_url, tdei_record_id]
        }
        return queryObject;
    }

    static getPublishRecordQuery(tdei_record_id: string): QueryConfig {
        const queryObject = {
            text: `UPDATE public.osw_versions SET status = 'Publish' , updated_at = CURRENT_TIMESTAMP 
            WHERE tdei_record_id = $1`,
            values: [tdei_record_id]
        }
        return queryObject;
    }

    static getDeleteRecordQuery(tdei_record_id: string, user_id: string): QueryConfig {
        const queryObject = {
            text: `UPDATE public.osw_versions SET status = 'Deleted' , updated_at = CURRENT_TIMESTAMP, updated_by = $1   
            WHERE tdei_record_id = $2`,
            values: [user_id, tdei_record_id]
        }
        return queryObject;
    }
}