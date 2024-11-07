import { IsNotEmpty, IsOptional } from 'class-validator';
import { Prop } from 'nodets-ms-core/lib/models';
import { QueryConfig } from 'pg';
import { BaseDto } from '../../model/base-dto';
import { TdeiDate } from '../../utility/tdei-date';
import { RecordStatus } from '../../model/dataset-get-query-params';
import { MetadataModel } from '../../model/metadata.model';
import { FeatureCollection } from 'geojson';
import { QueryCriteria } from '../dynamic-update-query';

export class DatasetEntity extends BaseDto {
    [key: string]: any;//This is to allow dynamic properties
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
    @Prop()
    @IsNotEmpty()
    metadata_json!: MetadataModel;
    //Metadata generated fields
    @Prop()
    @IsNotEmpty()
    name!: string;
    @Prop()
    @IsNotEmpty()
    version!: string;
    @Prop()
    @IsOptional()
    dataset_area!: FeatureCollection;
    @Prop()
    @IsNotEmpty()
    collection_date!: Date;
    @Prop()
    @IsOptional()
    valid_from!: Date;
    @Prop()
    @IsOptional()
    valid_to!: Date;
    @Prop()
    @IsOptional()
    dataset_osm_download_url!: string;
    @Prop()
    @IsOptional()
    upload_file_size_bytes!: number;

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
                latest_dataset_url,
                metadata_json,
                upload_file_size_bytes)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`.replace(/\n/g, ""),
            values: [this.tdei_dataset_id, this.tdei_service_id, this.tdei_project_group_id, this.data_type,
            this.dataset_url
                , this.uploaded_by,
            this.derived_from_dataset_id ?? null,
            this.status,
            TdeiDate.UTC(),
            this.changeset_url ?? null,
            this.metadata_url,
            this.updated_by,
            this.dataset_url,
            this.metadata_json,
            this.upload_file_size_bytes ?? null]
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



    /**
     * Generates an update query for the dataset entity. Typed DB query.
     * 
     * @param whereCondition - The condition to filter the dataset entity.
     * @param fields - The fields to update in the dataset entity.
     * @returns The generated update query.
     */
    static getUpdateQuery(whereCondition: Map<string, string>, fields: DatasetEntity): QueryConfig {
        const dataToUpdate: any = {};

        for (const key in fields) {
            if (fields.hasOwnProperty(key) && fields[key] !== undefined) {
                dataToUpdate[key] = fields[key];
            }
        }

        dataToUpdate.updated_at = TdeiDate.UTC();
        const criteria = new QueryCriteria().setTable('content.dataset').setData(dataToUpdate).setWhere(whereCondition);
        const query = criteria.buildUpdateQuery();
        return query;
    }

    /**
    * Query where the valid_from and valid_to dates are overlapping
    * Eg.
    * If Record has valid_from: 23-Mar-2023 and valid_to:23-Apr-2023
    *  {valid_from:01-Apr-2023, valid_to: 26-Apr-2023} : Invalid
    *  {valid_from:20-Mar-2023, valid_to: 26-Apr-2023} : Invalid
    *  {valid_from:20-Mar-2023, valid_to: 10-Apr-2023} : Invalid
    *  {valid_from:24-Mar-2023, valid_to: 10-Apr-2023} : Invalid
    *  {valid_from:24-Mar-2023, valid_to: 10-Apr-2023} : Invalid
    *  {valid_from:10-Mar-2023, valid_to: 22-Mar-2023} : Valid
    *  Same ord_id and service_id with the following condition
    *  input_valid_from >= record_valid_from && input_valid_to 
    */
    // getOverlapQuery(data_type: string, tdei_project_group_id: string, tdei_service_id: string): QueryConfig {
    //     const fromDate = TdeiDate.UTC(this.valid_from);
    //     const toDate = this.valid_to ? TdeiDate.UTC(this.valid_to) : TdeiDate.UTC();

    //     const queryObject = {
    //         text: `SELECT ov.tdei_dataset_id from content.dataset ov
    //         WHERE 
    //         ov.status = 'Publish'
    //         AND ov.data_type = $1
    //         AND ov.tdei_project_group_id = $2 
    //         AND ov.tdei_service_id = $3 
    //         AND (ov.valid_from,ov.valid_to) OVERLAPS ($4 , $5)`,
    //         values: [data_type, tdei_project_group_id, tdei_service_id, fromDate, toDate]
    //     };
    //     return queryObject;
    // }

}