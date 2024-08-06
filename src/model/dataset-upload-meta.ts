import { IsIn, IsISO8601, IsNotEmpty, IsObject, isObject, IsOptional } from "class-validator";
import { FeatureCollection } from "geojson";
import { AbstractDomainEntity, Prop } from "nodets-ms-core/lib/models";
import { Readable } from "stream";
import { IsValidPolygon } from "../validators/polygon-validator";

export class DatasetUploadMetadata extends AbstractDomainEntity {

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
    derived_from_dataset_id!: string;

    @Prop()
    @IsOptional()
    custom_metadata!: Object;

    @Prop()
    @IsNotEmpty()
    collected_by!: string;

    @Prop()
    @IsISO8601()
    @IsNotEmpty()
    collection_date!: Date;

    @Prop()
    @IsOptional()
    @IsISO8601()
    valid_from!: Date;

    @Prop()
    @IsOptional()
    @IsISO8601()
    valid_to!: Date;

    @Prop()
    @IsOptional()
    @IsIn(['manual', 'transform', 'generated', 'AV', 'others'])
    collection_method!: string;

    @Prop()
    @IsNotEmpty()
    @IsIn(['3rdParty', 'TDEITools', 'InHouse'])
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
}