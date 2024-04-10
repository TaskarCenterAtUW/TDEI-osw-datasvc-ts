import { FeatureCollection } from "geojson";
import { AbstractDomainEntity, Prop } from "nodets-ms-core/lib/models";

export class DatasetDTO extends AbstractDomainEntity {
    @Prop()
    data_type!: string;
    @Prop()
    tdei_dataset_id!: string;
    @Prop()
    status!: string;
    @Prop()
    tdei_project_group_id!: string;
    @Prop()
    tdei_service_id!: string;
    @Prop()
    name!: string;
    @Prop()
    version!: string;
    @Prop()
    description!: string;
    @Prop()
    derived_from_dataset_id!: string;
    @Prop()
    uploaded_timestamp!: Date;
    @Prop()
    confidence_level!: number;
    @Prop()
    custom_metadata!: Object;
    @Prop()
    collected_by!: string;
    @Prop()
    collection_date!: Date;
    @Prop()
    collection_method!: string;
    @Prop()
    valid_from!: Date;
    @Prop()
    valid_to!: Date;
    @Prop()
    data_source!: string;
    @Prop()
    schema_version!: string;
    @Prop()
    dataset_area: FeatureCollection | undefined;
    @Prop()
    download_url!: string;
}