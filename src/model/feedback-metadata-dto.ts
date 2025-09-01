import { IsOptional } from "class-validator";
import { AbstractDomainEntity, Prop } from "nodets-ms-core/lib/models";

export class FeedbackMetadataDTO extends AbstractDomainEntity {
    @Prop()
    total_count: number = 0;
    @Prop()
    total_overdues: number = 0;
    @Prop()
    total_open: number = 0;
}