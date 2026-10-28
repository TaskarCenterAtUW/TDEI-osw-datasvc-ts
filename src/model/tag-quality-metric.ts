import { AbstractDomainEntity, Prop } from "nodets-ms-core/lib/models";

export class TagQualityMetricRequest extends AbstractDomainEntity {
    @Prop()
    entity_type: string = "";
    @Prop()
    tags: string[] = [];
}

export class TagQualityMetricResponse extends AbstractDomainEntity {
    @Prop()
    entity_type: string = "";
    @Prop()
    total_entity_count: number = 0;
    @Prop()
    overall_quality_metric: number = 0;
    @Prop()
    metric_details: Map<string, string> = new Map<string, string>();
}