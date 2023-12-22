import { IsNotEmpty, IsOptional } from "class-validator";
import { FeatureCollection } from "geojson";
import { Prop } from "nodets-ms-core/lib/models";
import { IsValidPolygon } from "../validators/polygon-validator";
import { BaseDto } from "./base-dto";

export class ServiceDto extends BaseDto {
    @Prop("tdei_service_id")
    tdei_service_id = "0";
    @IsNotEmpty()
    @Prop()
    tdei_project_group_id!: string;
    @IsNotEmpty()
    @Prop("service_name")
    service_name!: string;
    @IsOptional()
    @IsValidPolygon()
    @Prop()
    polygon!: FeatureCollection;

    constructor(init?: Partial<ServiceDto>) {
        super();
        Object.assign(this, init);
    }
}
