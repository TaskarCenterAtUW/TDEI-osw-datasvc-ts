import { IsOptional } from "class-validator";
import { FeatureCollection } from "geojson";
import { AbstractDomainEntity, Prop } from "nodets-ms-core/lib/models";
import { IsValidPolygon } from "../validators/polygon-validator";

export class OswUploadModel extends AbstractDomainEntity {
    @Prop()
    user_id!: string;
    @Prop()
    tdei_record_id!: string;
    @Prop()
    tdei_project_group_id!: string;
    @Prop()
    tdei_service_id!: string;
    @Prop()
    file_upload_path!: string;
    @Prop()
    collected_by!: string;
    @Prop()
    collection_date!: Date;
    @Prop()
    collection_method!: string;
    // @Prop()
    // valid_from!: Date;
    // @Prop()
    // valid_to!: Date;
    @Prop()
    publication_date!: Date;
    @Prop()
    data_source!: string;
    @Prop()
    osw_schema_version!: string;
    @IsOptional()
    @IsValidPolygon()
    polygon!: FeatureCollection;
}

