
export class OswDTO {
    tdei_record_id: string = "";
    tdei_org_id: string = "";
    tdei_service_id: string = "";
    collected_by: string = "";
    collection_date: Date = new Date();
    collection_method: string = "";
    valid_from: Date = new Date();
    valid_to: Date = new Date();
    data_source: string = "";
    osw_schema_version: string = "";
}