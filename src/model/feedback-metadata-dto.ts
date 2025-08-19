import { AbstractDomainEntity, Prop } from "nodets-ms-core/lib/models";

export class FeedbackMetadataDTO extends AbstractDomainEntity {
    @Prop()
    total_count!: number;
    @Prop()
    total_overdues!: number;
    @Prop()
    total_open!: number;
}