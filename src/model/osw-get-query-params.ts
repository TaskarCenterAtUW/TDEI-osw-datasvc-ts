import { ArrayMaxSize, ArrayMinSize, IsArray, IsOptional } from "class-validator";
import { DynamicQueryObject, SqlORder } from "../database/dynamic-query-object";
import { InputException } from "../exceptions/http/http-exceptions";
import { TdeiDate } from "../utility/tdei-date";

export enum RecordStatus {
    "Publish" = "Publish",
    "Pre-Release" = "Pre-Release",
    "All" = "All"
}
export class OswQueryParams {
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
    osw_schema_version: string | undefined;
    @IsOptional()
    valid_to: string | undefined;
    @IsOptional()
    valid_from: string | undefined;
    @IsOptional()
    tdei_project_group_id: string | undefined;
    @IsOptional()
    tdei_service_id: string | undefined;
    @IsOptional()
    tdei_record_id: string | undefined;
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

    constructor(init?: Partial<OswQueryParams>) {
        Object.assign(this, init);
    }

    /**
   * Builds the parameterized sql query.
   * @returns DynamicQueryObject
   */
    getQueryObject(projectGroupIds: string[]) {
        const queryObject: DynamicQueryObject = new DynamicQueryObject();
        queryObject.buildSelect("content.dataset", ["ST_AsGeoJSON(dataset_area) as polygon2, *"]);
        queryObject.buildInnerJoin("content.dataset", "content.metadata", "tdei_dataset_id");
        queryObject.buildPagination(this.page_no, this.page_size);
        queryObject.buildOrder("uploaded_timestamp", SqlORder.DESC);

        //Do not serve deleted records
        queryObject.condition(` status != $${queryObject.paramCouter++} `, 'Deleted');

        //Add conditions
        if (this.status && this.status == RecordStatus["All"] && this.isAdmin) {
            queryObject.condition(` (status = $${queryObject.paramCouter++} or status = 'Pre-Release') `, RecordStatus.Publish.toString());
        } else if (this.status && this.status == RecordStatus["Pre-Release"] && projectGroupIds.length) {
            queryObject.condition(` status = 'Pre-Release' AND tdei_project_group_id in (${projectGroupIds.map(id => `'${id}'`).join(",")}) `, null);
        } else if (this.status && this.status == RecordStatus["All"] && projectGroupIds.length) {
            queryObject.condition(` (status = 'Publish' or (status ='Pre-Release' AND tdei_project_group_id in (${projectGroupIds.map(id => `'${id}'`).join(",")}))) `, null);
        }
        else if (this.status && this.status == RecordStatus["All"] && projectGroupIds.length == 0) {
            queryObject.condition(` status = $${queryObject.paramCouter++} `, RecordStatus.Publish.toString());
        } else if (this.status)
            queryObject.condition(` status = $${queryObject.paramCouter++} `, this.status.toString());

        if (this.name)
            queryObject.condition(` name ILIKE $${queryObject.paramCouter++} `, '%' + this.name + '%');
        if (this.version)
            queryObject.condition(` version = $${queryObject.paramCouter++} `, this.version);
        if (this.confidence_level)
            queryObject.condition(` confidence_level > $${queryObject.paramCouter++} `, this.confidence_level);
        if (this.data_source)
            queryObject.condition(` data_source = $${queryObject.paramCouter++} `, this.data_source);
        if (this.collected_by)
            queryObject.condition(` collected_by = $${queryObject.paramCouter++} `, this.collected_by);
        if (this.collection_method)
            queryObject.condition(` collection_method = $${queryObject.paramCouter++} `, this.collection_method);
        if (this.osw_schema_version)
            queryObject.condition(` schema_version = $${queryObject.paramCouter++} `, this.osw_schema_version);
        if (this.tdei_project_group_id)
            queryObject.condition(` tdei_project_group_id = $${queryObject.paramCouter++} `, this.tdei_project_group_id);
        if (this.tdei_service_id)
            queryObject.condition(` tdei_service_id = $${queryObject.paramCouter++} `, this.tdei_service_id);
        if (this.tdei_record_id)
            queryObject.condition(` dataset.tdei_dataset_id = $${queryObject.paramCouter++} `, this.tdei_record_id);
        if (this.derived_from_dataset_id)
            queryObject.condition(` dataset.derived_from_dataset_id = $${queryObject.paramCouter++} `, this.derived_from_dataset_id);
        if (this.valid_to && TdeiDate.isValid(this.valid_to))
            queryObject.condition(` valid_to > $${queryObject.paramCouter++} `, TdeiDate.UTC(this.valid_to));
        else if (this.valid_to && !TdeiDate.isValid(this.valid_to))
            throw new InputException("Invalid date provided." + this.valid_to);
        if (this.valid_from && TdeiDate.isValid(this.valid_from))
            queryObject.condition(` valid_from > $${queryObject.paramCouter++} `, TdeiDate.UTC(this.valid_from));
        else if (this.valid_from && !TdeiDate.isValid(this.valid_from))
            throw new InputException("Invalid date provided." + this.valid_from);
        if (this.collection_date && TdeiDate.isValid(this.collection_date))
            queryObject.condition(` collection_date > $${queryObject.paramCouter++} `, TdeiDate.UTC(this.collection_date));
        else if (this.collection_date && !TdeiDate.isValid(this.collection_date))
            throw new InputException("Invalid date provided." + this.collection_date);
        if (this.bbox && this.bbox.length > 0 && this.bbox.length == 4) {
            queryObject.condition(` (metadata.dataset_area && ST_MakeEnvelope($${queryObject.paramCouter++},$${queryObject.paramCouter++},$${queryObject.paramCouter++},$${queryObject.paramCouter++}, 4326))`,
                this.bbox);
        } else if (this.bbox.length > 0 && this.bbox.length != 4) {
            throw new InputException("Bounding box constraints not satisfied.");
        }

        return queryObject;
    }
}