import { ArrayMaxSize, ArrayMinSize, IsArray, IsOptional } from "class-validator";
import { JoinCondition, PgQueryObject, SqlORder, WhereCondition, buildQuery } from "../database/dynamic-query-object";
import { TdeiDate } from "../utility/tdei-date";
import { TDEIDataType } from "./jobs-get-query-params";
import { InputException } from "../exceptions/http/http-exceptions";

export enum RecordStatus {
    "Publish" = "Publish",
    "Pre-Release" = "Pre-Release",
    "All" = "All"
}
export class DatasetQueryParams {
    @IsOptional()
    data_type: TDEIDataType | undefined;

    @IsOptional()
    status: RecordStatus = RecordStatus.Publish;
    @IsOptional()
    name: string | undefined;
    @IsOptional()
    version: string | undefined;
    @IsOptional()
    collection_method: string | undefined;
    @IsOptional()
    collected_by: string | undefined;
    @IsOptional()
    data_source: string | undefined;
    @IsOptional()
    derived_from_dataset_id: string | undefined;
    @IsOptional()
    collection_date: Date | undefined;
    @IsOptional()
    schema_version: string | undefined;
    @IsOptional()
    valid_to: string | undefined;
    @IsOptional()
    valid_from: string | undefined;
    @IsOptional()
    tdei_project_group_id: string | undefined;
    @IsOptional()
    tdei_service_id: string | undefined;
    @IsOptional()
    tdei_dataset_id: string | undefined;
    @IsOptional()
    confidence_level = 0;
    @IsOptional()
    page_no = 1;
    @IsOptional()
    page_size = 10;
    @IsOptional()
    @IsArray()
    @ArrayMinSize(4)
    @ArrayMaxSize(4)
    bbox: Array<number> = [];

    isAdmin = false;

    constructor(init?: Partial<DatasetQueryParams>) {
        Object.assign(this, init);
    }

    getQuery(user_id: string): PgQueryObject {
        //Validate inputs
        if (this.valid_from && !TdeiDate.isValid(this.valid_from))
            throw new InputException("Invalid date provided." + this.valid_from)
        if (this.valid_to && !TdeiDate.isValid(this.valid_to))
            throw new InputException("Invalid date provided." + this.valid_to)
        if (this.collection_date && !TdeiDate.isValid(this.collection_date))
            throw new InputException("Invalid date provided." + this.collection_date)
        if (this.bbox && this.bbox.length > 0 && this.bbox.length != 4)
            throw new InputException("Invalid bounding box provided." + this.bbox)

        //Select columns
        const selectColumns = ['ST_AsGeoJSON(dataset_area) as dataset_area2', '*'];
        //Main table name
        const mainTableName = 'content.dataset';
        //Joins
        const joins: JoinCondition[] = [
            { tableName: 'content.metadata', alias: 'm', on: 'content.dataset.tdei_dataset_id = m.tdei_dataset_id' },
            { tableName: 'public.user_roles', alias: 'ur', on: `content.dataset.tdei_project_group_id = ur.project_group_id AND ur.user_id = '${user_id}'`, type: 'LEFT' }
        ];
        //Conditions
        const conditions: WhereCondition[] = [];
        addConditionIfValueExists('status !=', 'Deleted');
        addConditionIfValueExists('data_type =', this.data_type);

        if (this.status && this.status == RecordStatus["All"] && this.isAdmin) {
            conditions.push({ clouse: `(status = 'Publish' OR status = 'Pre-Release')` });
        } else if (this.status && this.status == RecordStatus["Pre-Release"]) {
            conditions.push({ clouse: `(status = 'Pre-Release' AND ur.project_group_id IS NOT NULL)` });
        } else if (this.status && this.status == RecordStatus["All"]) {
            conditions.push({ clouse: `(status = 'Publish' OR (status = 'Pre-Release' AND ur.project_group_id IS NOT NULL))` });
        } else if (this.status)
            conditions.push({ clouse: 'status = ', value: this.status });

        addConditionIfValueExists('m.name ILIKE ', this.name ? '%' + this.name + '%' : null);
        addConditionIfValueExists('m.version = ', this.version);
        addConditionIfValueExists('confidence_level > ', this.confidence_level);
        addConditionIfValueExists('m.data_source = ', this.data_source);
        addConditionIfValueExists('m.collected_by = ', this.collected_by);
        addConditionIfValueExists('m.collection_method = ', this.collection_method);
        addConditionIfValueExists('m.schema_version = ', this.schema_version);
        addConditionIfValueExists('tdei_project_group_id = ', this.tdei_project_group_id);
        addConditionIfValueExists('tdei_service_id = ', this.tdei_service_id);
        addConditionIfValueExists('dataset.tdei_dataset_id = ', this.tdei_dataset_id);
        addConditionIfValueExists('dataset.derived_from_dataset_id = ', this.derived_from_dataset_id);
        addConditionIfValueExists('valid_to > ', this.valid_to && TdeiDate.isValid(this.valid_to) ? TdeiDate.UTC(this.valid_to) : null);
        addConditionIfValueExists('valid_from > ', this.valid_from && TdeiDate.isValid(this.valid_from) ? TdeiDate.UTC(this.valid_from) : null);
        addConditionIfValueExists('collection_date > ', this.collection_date && TdeiDate.isValid(this.collection_date) ? TdeiDate.UTC(this.collection_date) : null);
        if (this.bbox && this.bbox.length > 0 && this.bbox.length == 4) {
            conditions.push({ clouse: `(metadata.dataset_area && ST_MakeEnvelope(${this.bbox[0]},${this.bbox[1]},${this.bbox[2]},${this.bbox[3]}, 4326))` });
        }

        //Sort field
        const sortField = 'uploaded_timestamp';
        const sortOrder = SqlORder.DESC;
        //Build the query
        const queryObject = buildQuery(selectColumns, mainTableName, conditions, joins, sortField, sortOrder, this.page_size, this.page_no);

        function addConditionIfValueExists(clouse: string, value: any) {
            if (value) {
                conditions.push({ clouse, value });
            }
        }

        return queryObject;
    }
}