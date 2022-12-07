export class OswQueryParams {
    osw_schema_version: string | undefined;
    date_time: string | undefined;
    tdei_org_id: string | undefined;
    tdei_record_id: string | undefined;
    tdei_service_id: string | undefined;
    confidence_level: number = 0;
    page_no: number = 1;
    page_size: number = 10;
}