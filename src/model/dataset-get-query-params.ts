import { ArrayMaxSize, ArrayMinSize, IsArray, IsOptional } from "class-validator";
import { JoinCondition, PgQueryObject, SqlORder, WhereCondition, buildQuery } from "../database/dynamic-query-object";
import { TdeiDate } from "../utility/tdei-date";
import { TDEIDataType } from "./jobs-get-query-params";
import { InputException } from "../exceptions/http/http-exceptions";
import { Utility } from "../utility/utility";

export enum RecordStatus {
    "Publish" = "Publish",
    "Pre-Release" = "Pre-Release",
    "Draft" = "Draft",
    "All" = "All"
}

export enum SortField {
    status = 'd.status',
    valid_from = 'd.valid_from',
    valid_to = 'd.valid_to',
    uploaded_timestamp = 'd.uploaded_timestamp',
    project_group_name = 'pg.name',
}

export class DatasetQueryParams {
    @IsOptional()
    data_type: TDEIDataType | undefined;

    @IsOptional()
    status: RecordStatus = RecordStatus.All;
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
    @IsOptional()
    description: string | undefined;
    @IsOptional()   //DataProvenance
    full_dataset_name: string | undefined;
    @IsOptional()
    other_published_locations: string | undefined;
    @IsOptional()
    dataset_update_frequency_months: string | undefined;
    @IsOptional()
    schema_validation_run: string | undefined;
    @IsOptional()
    schema_validation_run_description: string | undefined;
    @IsOptional()
    allow_crowd_contributions: string | undefined;
    @IsOptional()
    location_inaccuracy_factors: string | undefined;
    @IsOptional() //DatasetSummary
    collection_name: string | undefined;
    @IsOptional()
    department_name: string | undefined;
    @IsOptional()
    city: string | undefined;
    @IsOptional()
    region: string | undefined;
    @IsOptional()
    county: string | undefined;
    @IsOptional()
    key_limitations_of_the_dataset: string | undefined;
    @IsOptional()
    challenges: string | undefined;
    @IsOptional() //Maintenance
    official_maintainer: string[] | undefined;
    @IsOptional()
    last_updated: string | undefined;
    @IsOptional()
    update_frequency: string | undefined;
    @IsOptional()
    authorization_chain: string | undefined;
    @IsOptional()
    maintenance_funded: boolean | undefined;
    @IsOptional()
    funding_details: string | undefined;
    @IsOptional() //Methodology
    point_data_collection_device: string | undefined;
    @IsOptional()
    node_locations_and_attributes_editing_software: string | undefined;
    @IsOptional()
    data_collected_by_people: boolean | undefined;
    @IsOptional()
    data_collectors: string | undefined;
    @IsOptional()
    data_captured_automatically: boolean | undefined;
    @IsOptional()
    automated_collection: string | undefined;
    @IsOptional()
    data_collectors_organization: string | undefined;
    @IsOptional()
    data_collector_compensation: string | undefined;
    @IsOptional()
    preprocessing_location: string | undefined;
    @IsOptional()
    preprocessing_by: string | undefined;
    @IsOptional()
    preprocessing_steps: string | undefined;
    @IsOptional()
    data_collection_preprocessing_documentation: boolean | undefined;
    @IsOptional()
    documentation_uri: string | undefined;
    @IsOptional()
    validation_process_exists: string | undefined;
    @IsOptional()
    validation_process_description: string | undefined;
    @IsOptional()
    validation_conducted_by: string | undefined;
    @IsOptional()
    excluded_data: string | undefined;
    @IsOptional()
    excluded_data_reason: string | undefined;
    @IsOptional()
    sort_field: SortField = SortField.uploaded_timestamp;
    @IsOptional()
    sort_order: SqlORder = SqlORder.DESC;


    isAdmin = false;

    constructor(init?: Partial<DatasetQueryParams>) {
        Object.assign(this, init);
    }

    getQuery(user_id: string): PgQueryObject {
        //Validate inputs
        if (!Object.keys(SortField).includes(this.sort_field))
            throw new InputException("Invalid sort field provided." + this.sort_field);
        if (!Object.keys(SqlORder).includes(this.sort_order))
            throw new InputException("Invalid sort order provided." + this.sort_order);

        if (this.valid_from && !TdeiDate.isValid(this.valid_from))
            throw new InputException("Invalid date provided." + this.valid_from)
        if (this.valid_to && !TdeiDate.isValid(this.valid_to))
            throw new InputException("Invalid date provided." + this.valid_to)
        if (this.collection_date && !TdeiDate.isValid(this.collection_date))
            throw new InputException("Invalid date provided." + this.collection_date)
        if (this.bbox && this.bbox.length > 0 && this.bbox.length != 4)
            throw new InputException("Invalid bounding box provided." + this.bbox)

        //Select columns
        const selectColumns = ['ST_AsGeoJSON(dataset_area) as dataset_area2', '*', 'pg.name as project_group_name', 's.name as service_name', 'd.name as dataset_name'];
        //Main table name
        const mainTableName = 'content.dataset d';
        //Joins
        const joins: JoinCondition[] = [
            // { tableName: 'content.metadata', alias: 'm', on: 'content.dataset.tdei_dataset_id = m.tdei_dataset_id' },
            {
                tableName: `(select project_group_id, user_id from public.user_roles GROUP BY project_group_id, user_id)`, alias: 'ur', on: `d.tdei_project_group_id = ur.project_group_id AND ur.user_id = '${user_id}'`, type: 'LEFT'
            },
            { tableName: 'public.project_group', alias: 'pg', on: 'd.tdei_project_group_id = pg.project_group_id', type: 'LEFT' },
            { tableName: 'public.service', alias: 's', on: 'd.tdei_service_id = s.service_id AND d.tdei_project_group_id = s.owner_project_group', type: 'LEFT' }
        ];
        //Conditions
        const conditions: WhereCondition[] = [];
        addConditionIfValueExists('status !=', 'Deleted');
        addConditionIfValueExists('status !=', 'Draft');
        addConditionIfValueExists('data_type =', this.data_type);

        if (this.status && this.status == RecordStatus["Publish"]) {
            conditions.push({ clouse: `status = 'Publish' ` });
        }
        else if (this.status && this.isAdmin && this.status == RecordStatus["All"]) {
            conditions.push({ clouse: `(status = 'Publish' OR status = 'Pre-Release')` });
        } else if (this.status && this.isAdmin && this.status == RecordStatus["Pre-Release"]) {
            conditions.push({ clouse: ` status = 'Pre-Release' ` });
        } else if (this.status && this.status == RecordStatus["Pre-Release"]) {
            conditions.push({ clouse: `(status = 'Pre-Release' AND ur.project_group_id IS NOT NULL)` });
        } else if (this.status && this.status == RecordStatus["All"]) {
            conditions.push({ clouse: `(status = 'Publish' OR (status = 'Pre-Release' AND ur.project_group_id IS NOT NULL))` });
        }

        addConditionIfValueExists('d.name ILIKE ', this.name ? '%' + this.name + '%' : null);
        addConditionIfValueExists('d.version = ', this.version);
        addConditionIfValueExists('d.confidence_level > ', this.confidence_level);
        addConditionIfValueExists('d.tdei_project_group_id = ', this.tdei_project_group_id);
        addConditionIfValueExists('d.tdei_service_id = ', this.tdei_service_id);
        addConditionIfValueExists('d.tdei_dataset_id = ', this.tdei_dataset_id);
        addConditionIfValueExists('d.derived_from_dataset_id = ', this.derived_from_dataset_id);
        addConditionIfValueExists('d.valid_to > ', this.valid_to && TdeiDate.isValid(this.valid_to) ? TdeiDate.UTC(this.valid_to) : null);
        addConditionIfValueExists('d.valid_from > ', this.valid_from && TdeiDate.isValid(this.valid_from) ? TdeiDate.UTC(this.valid_from) : null);
        addConditionIfValueExists('d.collection_date > ', this.collection_date && TdeiDate.isValid(this.collection_date) ? TdeiDate.UTC(this.collection_date) : null);
        if (this.bbox && this.bbox.length > 0 && this.bbox.length == 4) {
            conditions.push({ clouse: `(d.dataset_area && ST_MakeEnvelope(${this.bbox[0]},${this.bbox[1]},${this.bbox[2]},${this.bbox[3]}, 4326))` });
        }

        //Metadata fields
        addConditionIfValueExists('d.metadata_json->>\'description\' = ', this.description);
        addConditionIfValueExists('d.metadata_json->>\'data_source\' = ', this.data_source);
        addConditionIfValueExists('d.metadata_json->>\'collected_by\' = ', this.collected_by);
        addConditionIfValueExists('d.metadata_json->>\'collection_method\' = ', this.collection_method);
        addConditionIfValueExists('d.metadata_json->>\'schema_version\' = ', this.schema_version);
        addConditionIfValueExists('d.metadata_json->>\'full_dataset_name\' ILIKE ', this.full_dataset_name ? '%' + this.full_dataset_name + '%' : null);
        addConditionIfValueExists('d.metadata_json->>\'other_published_locations\' ILIKE ', this.other_published_locations ? '%' + this.other_published_locations + '%' : null);
        addConditionIfValueExists('d.metadata_json->>\'dataset_update_frequency_months\' >= ', this.dataset_update_frequency_months);
        addConditionIfValueExists('d.metadata_json->>\'schema_validation_run\' = ', this.schema_validation_run);
        addConditionIfValueExists('d.metadata_json->>\'schema_validation_run_description\' ILIKE ', this.schema_validation_run_description ? '%' + this.schema_validation_run_description + '%' : null);
        addConditionIfValueExists('d.metadata_json->>\'allow_crowd_contributions\' = ', this.allow_crowd_contributions);
        addConditionIfValueExists('d.metadata_json->>\'location_inaccuracy_factors\' ILIKE ', this.location_inaccuracy_factors ? '%' + this.location_inaccuracy_factors + '%' : null);
        addConditionIfValueExists('d.metadata_json->>\'collection_name\' ILIKE ', this.collection_name ? '%' + this.collection_name + '%' : null);
        addConditionIfValueExists('d.metadata_json->>\'department_name\' ILIKE ', this.department_name ? '%' + this.department_name + '%' : null);
        addConditionIfValueExists('d.metadata_json->>\'city\' ILIKE ', this.city ? '%' + this.city + '%' : null);
        addConditionIfValueExists('d.metadata_json->>\'region\' ILIKE ', this.region ? '%' + this.region + '%' : null);
        addConditionIfValueExists('d.metadata_json->>\'county\' ILIKE ', this.county ? '%' + this.county + '%' : null);
        addConditionIfValueExists('d.metadata_json->>\'key_limitations_of_the_dataset\' ILIKE ', this.key_limitations_of_the_dataset ? '%' + this.key_limitations_of_the_dataset + '%' : null);
        addConditionIfValueExists('d.metadata_json->>\'challenges\' ILIKE ', this.challenges ? '%' + this.challenges + '%' : null);
        addConditionIfValueExists('(d.metadata_json->>\'official_maintainer\')::jsonb @> ', this.official_maintainer ? `[${Utility.stringArrayToDBString(this.official_maintainer)}]` : null);
        addConditionIfValueExists('d.metadata_json->>\'last_updated\' ILIKE ', this.last_updated ? '%' + this.last_updated + '%' : null);
        addConditionIfValueExists('d.metadata_json->>\'update_frequency\' ILIKE ', this.update_frequency ? '%' + this.update_frequency + '%' : null);
        addConditionIfValueExists('d.metadata_json->>\'authorization_chain\' ILIKE ', this.authorization_chain ? '%' + this.authorization_chain + '%' : null);
        addConditionIfValueExists('d.metadata_json->>\'maintenance_funded\' = ', this.maintenance_funded);
        addConditionIfValueExists('d.metadata_json->>\'funding_details\' ILIKE ', this.funding_details ? '%' + this.funding_details + '%' : null);
        addConditionIfValueExists('d.metadata_json->>\'point_data_collection_device\' ILIKE ', this.point_data_collection_device ? '%' + this.point_data_collection_device + '%' : null);
        addConditionIfValueExists('d.metadata_json->>\'node_locations_and_attributes_editing_software\' ILIKE ', this.node_locations_and_attributes_editing_software ? '%' + this.node_locations_and_attributes_editing_software + '%' : null);
        addConditionIfValueExists('d.metadata_json->>\'data_collected_by_people\' = ', this.data_collected_by_people);
        addConditionIfValueExists('d.metadata_json->>\'data_collectors\' ILIKE ', this.data_collectors ? '%' + this.data_collectors + '%' : null);
        addConditionIfValueExists('d.metadata_json->>\'data_captured_automatically\' = ', this.data_captured_automatically);
        addConditionIfValueExists('d.metadata_json->>\'automated_collection\' ILIKE ', this.automated_collection ? '%' + this.automated_collection + '%' : null);
        addConditionIfValueExists('d.metadata_json->>\'data_collectors_organization\' ILIKE ', this.data_collectors_organization ? '%' + this.data_collectors_organization + '%' : null);
        addConditionIfValueExists('d.metadata_json->>\'data_collector_compensation\' ILIKE ', this.data_collector_compensation ? '%' + this.data_collector_compensation + '%' : null);
        addConditionIfValueExists('d.metadata_json->>\'preprocessing_location\' ILIKE ', this.preprocessing_location ? '%' + this.preprocessing_location + '%' : null);
        addConditionIfValueExists('d.metadata_json->>\'preprocessing_by\' ILIKE ', this.preprocessing_by ? '%' + this.preprocessing_by + '%' : null);
        addConditionIfValueExists('d.metadata_json->>\'preprocessing_steps\' ILIKE ', this.preprocessing_steps ? '%' + this.preprocessing_steps + '%' : null);
        addConditionIfValueExists('d.metadata_json->>\'data_collection_preprocessing_documentation\' = ', this.data_collection_preprocessing_documentation);
        addConditionIfValueExists('d.metadata_json->>\'documentation_uri\' ILIKE ', this.documentation_uri ? '%' + this.documentation_uri + '%' : null);
        addConditionIfValueExists('d.metadata_json->>\'validation_process_exists\' ILIKE ', this.validation_process_exists ? '%' + this.validation_process_exists + '%' : null);
        addConditionIfValueExists('d.metadata_json->>\'validation_process_description\' ILIKE ', this.validation_process_description ? '%' + this.validation_process_description + '%' : null);
        addConditionIfValueExists('d.metadata_json->>\'validation_conducted_by\' ILIKE ', this.validation_conducted_by ? '%' + this.validation_conducted_by + '%' : null);
        addConditionIfValueExists('d.metadata_json->>\'excluded_data\' ILIKE ', this.excluded_data ? '%' + this.excluded_data + '%' : null);
        addConditionIfValueExists('d.metadata_json->>\'excluded_data_reason\' ILIKE ', this.excluded_data_reason ? '%' + this.excluded_data_reason + '%' : null);

        //Sort field
        // const sortField = 'uploaded_timestamp';
        // const sortOrder = SqlORder.DESC;
        //Build the query
        const queryObject = buildQuery(selectColumns, mainTableName, conditions, joins, this.sort_field, this.sort_order, this.page_size, this.page_no);

        function addConditionIfValueExists(clouse: string, value: any) {
            if (value) {
                conditions.push({ clouse, value });
            }
        }
        return queryObject;
    }
}