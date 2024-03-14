import { IsNotEmpty, IsObject, IsOptional } from 'class-validator';
import { FeatureCollection } from 'geojson';
import { Prop } from 'nodets-ms-core/lib/models';
import { QueryConfig } from 'pg';
import { BaseDto } from '../../model/base-dto';
import { IsValidPolygon } from '../../validators/polygon-validator';
import { TdeiDate } from '../../utility/tdei-date';

export class MetadataEntity extends BaseDto {

    @Prop()
    metadata_id!: number;
    @Prop()
    @IsNotEmpty()
    tdei_dataset_id!: string;
    @Prop()
    @IsNotEmpty()
    name!: string;

    @Prop()
    @IsOptional()
    description!: string;

    @Prop()
    @IsNotEmpty()
    version!: string;

    @Prop()
    @IsOptional()
    custom_metadata!: Object;

    @Prop()
    @IsNotEmpty()
    collected_by!: string;

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
    collection_method!: string;

    @Prop()
    @IsNotEmpty()
    data_source!: string;

    @Prop()
    @IsOptional()
    @IsNotEmpty()
    @IsObject()
    @IsValidPolygon()
    dataset_area!: FeatureCollection;

    @Prop()
    @IsNotEmpty()
    schema_version!: string;

    constructor(init?: Partial<MetadataEntity>) {
        super();
        Object.assign(this, init);
    }

    /**
     * Builds the insert QueryConfig object
     * @returns QueryConfig object
     */
    getInsertQuery(): QueryConfig {
        const queryObject = {
            text: `INSERT INTO content.metadata(
                tdei_dataset_id, 
                name, 
                version, 
                description, 
                custom_metadata, 
                collected_by, 
                collection_date, 
                collection_method, 
                valid_from, 
                valid_to, 
                data_source, 
                schema_version, 
                dataset_area)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13);`.replace(/\n/g, ""),
            values: [this.tdei_dataset_id, this.name, this.version, this.description,
            this.custom_metadata, this.collected_by, TdeiDate.UTC(this.collection_date), this.collection_method,
            this.valid_from ? TdeiDate.UTC(this.valid_from) : TdeiDate.UTC(), TdeiDate.UTC(this.valid_to),
            this.data_source, this.schema_version,
            this.dataset_area ? JSON.stringify(this.dataset_area.features[0].geometry) : null],
        }

        return queryObject;
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
    getOverlapQuery(tdei_project_group_id: string, tdei_service_id: string): QueryConfig {
        const fromDate = TdeiDate.UTC(this.valid_from);
        const toDate = this.valid_to ? TdeiDate.UTC(this.valid_to) : TdeiDate.UTC();

        const queryObject = {
            text: `SELECT ov.tdei_dataset_id from content.metadata om
            INNER JOIN  content.dataset ov on ov.tdei_dataset_id = om.tdei_dataset_id
            WHERE 
            ov.status = 'Publish'
            AND ov.tdei_project_group_id = $1 
            AND ov.tdei_service_id = $2 
            AND (valid_from,valid_to) OVERLAPS ($3 , $4)`,
            values: [tdei_project_group_id, tdei_service_id, fromDate, toDate]
        };
        return queryObject;
    }
}