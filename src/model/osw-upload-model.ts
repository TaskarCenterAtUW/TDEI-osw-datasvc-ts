import { Polygon } from "./polygon-model";

export class OswUploadModel {
    user_id!: string;
    tdei_record_id!: string;
    tdei_org_id!: string;
    tdei_service_id!: string;
    file_upload_path!: string;
    collected_by!: string;
    collection_date!: Date;
    collection_method!: string;
    valid_from!: Date;
    valid_to!: Date;
    data_source!: string;
    osw_schema_version!: string;
    polygon!: Polygon;
}

