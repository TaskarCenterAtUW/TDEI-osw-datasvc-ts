import { FeatureCollection } from "geojson";
import { AbstractDomainEntity, Prop } from "nodets-ms-core/lib/models";

export class OswDTO extends AbstractDomainEntity {
    @Prop()
    tdei_record_id!: string;
    @Prop()
    tdei_org_id!: string;
    @Prop()
    tdei_service_id!: string;
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
    osw_schema_version!: string;
    @Prop()
    polygon: FeatureCollection | undefined;
}