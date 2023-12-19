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
                confidence_level, 
                tdei_service_id, 
                tdei_project_group_id,
                download_osw_url, 
                uploaded_by, 
                uploaded_timestamp, 
                cm_version, 
                cm_last_calculated_at, 
                derived_from_dataset_id, 
                status)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`.replace(/\n/g, ""),
            values: [this.tdei_record_id, this.confidence_level, this.tdei_service_id, this.tdei_project_group_id, this.download_osw_url
                , this.uploaded_by, this.uploaded_timestamp, this.cm_version, this.cm_last_calculated_at, this.derived_from_dataset_id, this.status],
        }

        return queryObject;
    }
}