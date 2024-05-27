import { IsNotEmpty } from 'class-validator';
import { Prop } from 'nodets-ms-core/lib/models';
import { QueryConfig } from 'pg';
import { BaseDto } from '../../model/base-dto';
import { TdeiDate } from '../../utility/tdei-date';
import { RecordStatus } from '../../model/dataset-get-query-params';

export class DatasetEntity extends BaseDto {
    @Prop()
    @IsNotEmpty()
    tdei_dataset_id!: string;
    @Prop()
    @IsNotEmpty()
    data_type!: string;
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
    dataset_url!: string;
    @Prop()
    osm_url!: string;
    @Prop()
    changeset_url!: string;
    @Prop()
    metadata_url!: string;
    @Prop()
    @IsNotEmpty()
    uploaded_by!: string;
    @Prop()
    cm_version!: string;
    @Prop()
    cm_last_calculated_at!: string;
    @Prop()
    @IsNotEmpty()
    status: string = RecordStatus.Draft;
    @Prop()
    uploaded_timestamp!: Date;
    @Prop()
    updated_at!: string;
    @Prop()
    updated_by!: string;
    @Prop()
    latest_dataset_url!: string;
    @Prop()
    latest_osm_url!: string;
    @Prop()
    dataset_download_url!: string;

    constructor(init?: Partial<DatasetEntity>) {
        super();
        Object.assign(this, init);
    }

    /**
     * Builds the insert QueryConfig object
     * @returns QueryConfig object
     */
    getInsertQuery(): QueryConfig {

        const queryObject = {
            text: `INSERT INTO content.dataset(
                tdei_dataset_id,
                tdei_service_id, 
                tdei_project_group_id,
                data_type,
                dataset_url,
                uploaded_by, 
                derived_from_dataset_id, 
                status,
                uploaded_timestamp,
                changeset_url,
                metadata_url,
                updated_by,
                latest_dataset_url)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`.replace(/\n/g, ""),
            values: [this.tdei_dataset_id, this.tdei_service_id, this.tdei_project_group_id, this.data_type,
            this.dataset_url
                , this.uploaded_by,
            this.derived_from_dataset_id ?? null,
            this.status,
            TdeiDate.UTC(),
            this.changeset_url ?? null,
            this.metadata_url,
            this.updated_by,
            this.dataset_url]
        }
        return queryObject;
    }


    static getUpdateFormatUrlQuery(tdei_dataset_id: string, download_osm_url: string): QueryConfig {
        const queryObject = {
            text: `UPDATE content.dataset SET osm_url = $1 , latest_osm_url = $1 , updated_at = CURRENT_TIMESTAMP 
            WHERE tdei_dataset_id = $2`,
            values: [download_osm_url, tdei_dataset_id]
        }
        return queryObject;
    }

    static getUpdateLatestOsmUrlQuery(tdei_dataset_id: string, download_osm_url: string): QueryConfig {
        const queryObject = {
            text: `UPDATE content.dataset SET latest_osm_url = $1 , updated_at = CURRENT_TIMESTAMP 
            WHERE tdei_dataset_id = $2`,
            values: [download_osm_url, tdei_dataset_id]
        }
        return queryObject;
    }

    static getUpdateLatestDatasetUrlQuery(tdei_dataset_id: string, download_osm_url: string): QueryConfig {
        const queryObject = {
            text: `UPDATE content.dataset SET latest_dataset_url = $1 , updated_at = CURRENT_TIMESTAMP 
            WHERE tdei_dataset_id = $2`,
            values: [download_osm_url, tdei_dataset_id]
        }
        return queryObject;
    }

    static getUpdateDatasetZipUrlQuery(tdei_dataset_id: string, zip_url: string): QueryConfig {
        const queryObject = {
            text: `UPDATE content.dataset SET dataset_download_url = $1 , updated_at = CURRENT_TIMESTAMP 
            WHERE tdei_dataset_id = $2`,
            values: [zip_url, tdei_dataset_id]
        }
        return queryObject;
    }

    static getUpdateDatasetOsmZipUrlQuery(tdei_dataset_id: string, zip_url: string): QueryConfig {
        const queryObject = {
            text: `UPDATE content.dataset SET dataset_osm_download_url = $1 , updated_at = CURRENT_TIMESTAMP 
            WHERE tdei_dataset_id = $2`,
            values: [zip_url, tdei_dataset_id]
        }
        return queryObject;
    }

    static getStatusUpdateQuery(tdei_dataset_id: string, status: RecordStatus): QueryConfig {
        const queryObject = {
            text: `UPDATE content.dataset SET status = $1 , updated_at = CURRENT_TIMESTAMP 
            WHERE tdei_dataset_id = $2`,
            values: [status, tdei_dataset_id]
        }
        return queryObject;
    }

    static getDeleteRecordQuery(tdei_dataset_id: string, user_id: string): QueryConfig {
        const queryObject = {
            text: `UPDATE content.dataset SET status = 'Deleted' , updated_at = CURRENT_TIMESTAMP, updated_by = $1   
            WHERE tdei_dataset_id = $2`,
            values: [user_id, tdei_dataset_id]
        }
        return queryObject;
    }
}