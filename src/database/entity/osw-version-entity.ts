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
                uploaded_timestamp, 
                derived_from_dataset_id, 
                status)
                VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP, $6, $7)`.replace(/\n/g, ""),
            values: [this.tdei_record_id, this.tdei_service_id, this.tdei_project_group_id, this.download_osw_url
                , this.uploaded_by, this.derived_from_dataset_id, this.status],
        }

        return queryObject;
    }


    static getUpdateFormatUrlQuery(tdei_record_id: string, download_osm_url: string): QueryConfig {
        const queryObject = {
            text: `UPDATE public.osw_versions SET download_osm_url = $1 , uploaded_timestamp = CURRENT_TIMESTAMP
            WHERE tdei_record_id = $2`,
            values: [download_osm_url, tdei_record_id]
        }
        return queryObject;
    }

    static getPublishRecordQuery(tdei_record_id: string): QueryConfig {
        const queryObject = {
            text: `UPDATE public.osw_versions SET status = 'Published' , uploaded_timestamp = CURRENT_TIMESTAMP
            WHERE tdei_record_id = $1`,
            values: [tdei_record_id]
        }
        return queryObject;
    }
}