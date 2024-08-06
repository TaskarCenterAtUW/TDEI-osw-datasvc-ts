import { FeatureCollection } from "geojson";
import { AbstractDomainEntity, Prop } from "nodets-ms-core/lib/models";
import { MetadataModel } from "./metadata.model";

export class DatasetDTO extends AbstractDomainEntity {
    @Prop()
    data_type!: string;
    @Prop()
    tdei_dataset_id!: string;
    @Prop()
    status!: string;
    @Prop()
    project_group!: IProjectGroup;
    @Prop()
    service!: IService;
    @Prop()
    derived_from_dataset_id!: string;
    @Prop()
    uploaded_timestamp!: Date;
    @Prop()
    confidence_level!: number;
    @Prop()
    download_url!: string;
    @Prop()
    metadata!: MetadataModel;
}

export interface IProjectGroup {
    tdei_project_group_id: string;
    name: string;
}

export interface IService {
    tdei_service_id: string;
    name: string;
}