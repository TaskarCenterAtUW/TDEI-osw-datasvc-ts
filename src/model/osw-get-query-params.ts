import { ArrayMaxSize, ArrayMinSize, IsArray, IsOptional } from "class-validator";
import { DynamicQueryObject, SqlORder } from "../database/dynamic-query-object";
import { InputException } from "../exceptions/http/http-exceptions";
import { Utility } from "../utility/utility";

enum RecordStatus {
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
    osw_schema_version: string | undefined;
    @IsOptional()
    date_time: string | undefined;
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

    constructor(init?: Partial<OswQueryParams>) {
        Object.assign(this, init);
    }

    /**
   * Builds the parameterized sql query.
   * @returns DynamicQueryObject
   */
    getQueryObject() {
        const queryObject: DynamicQueryObject = new DynamicQueryObject();
        queryObject.buildSelect("osw_versions", ["ST_AsGeoJSON(dataset_area) as polygon2, *"]);
        queryObject.buildInnerJoin("osw_versions", "osw_metadata", "tdei_record_id");
        queryObject.buildPagination(this.page_no, this.page_size);
        queryObject.buildOrder("uploaded_timestamp", SqlORder.DESC);
        //Add conditions
        if (this.status)
            queryObject.condition(` status = $${queryObject.paramCouter++} `, this.status.toString());
        if (this.name)
            queryObject.condition(` name = $${queryObject.paramCouter++} `, this.name);
        if (this.version)
            queryObject.condition(` version = $${queryObject.paramCouter++} `, this.version);
        if (this.osw_schema_version)
            queryObject.condition(` osw_schema_version = $${queryObject.paramCouter++} `, this.osw_schema_version);
        if (this.tdei_project_group_id)
            queryObject.condition(` tdei_project_group_id = $${queryObject.paramCouter++} `, this.tdei_project_group_id);
        if (this.tdei_service_id)
            queryObject.condition(` tdei_service_id = $${queryObject.paramCouter++} `, this.tdei_service_id);
        if (this.tdei_record_id)
            queryObject.condition(` osw_versions.tdei_record_id = $${queryObject.paramCouter++} `, this.tdei_record_id);
        if (this.date_time && Utility.dateIsValid(this.date_time))
            queryObject.condition(` valid_to > $${queryObject.paramCouter++} `, (new Date(this.date_time).toISOString()));
        else if (this.date_time && !Utility.dateIsValid(this.date_time))
            throw new InputException("Invalid date provided." + this.date_time);
        if (this.bbox && this.bbox.length > 0 && this.bbox.length == 4) {
            queryObject.condition(`polygon && ST_MakeEnvelope($${queryObject.paramCouter++},$${queryObject.paramCouter++},$${queryObject.paramCouter++},$${queryObject.paramCouter++}, 4326)`,
                this.bbox);
        } else if (this.bbox.length > 0 && this.bbox.length != 4) {
            throw new InputException("Bounding box constraints not satisfied.");
        }

        return queryObject;
    }
}