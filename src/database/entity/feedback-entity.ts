import { BaseDto } from "../../model/base-dto";
import { Prop } from "nodets-ms-core/lib/models";
import { IsNotEmpty } from "class-validator";
import { QueryConfig } from "pg";

export enum FeedbackStatusEnum {
    open = "open",
    resolved = "resolved"
}

export class FeedbackEntity extends BaseDto {
    @Prop()
    id!: number;
    @Prop()
    @IsNotEmpty()
    tdei_project_id!: string;
    @Prop()
    @IsNotEmpty()
    tdei_dataset_id!: string;
    @Prop()
    dataset_element_id!: string;
    @Prop()
    @IsNotEmpty()
    feedback_text!: string;
    @Prop()
    @IsNotEmpty()
    customer_email!: string;
    @Prop()
    @IsNotEmpty()
    location_latitude!: number;
    @Prop()
    @IsNotEmpty()
    location_longitude!: number;
    @Prop()
    @IsNotEmpty()
    due_date!: string;
    @Prop()
    @IsNotEmpty()
    status: FeedbackStatusEnum = FeedbackStatusEnum.open;
    @Prop()
    created_at!: string;
    @Prop()
    updated_at!: string;

    constructor(init?: Partial<FeedbackEntity>) {
        super();
        Object.assign(this, init);
    }

    public getInsertQuery(): QueryConfig {
        const query: QueryConfig = {
            text: `INSERT INTO content.feedback (tdei_project_id, tdei_dataset_id, dataset_element_id, feedback_text, customer_email, location_latitude, location_longitude, due_date)
                   VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                   RETURNING id`,
            values: [
                this.tdei_project_id,
                this.tdei_dataset_id,
                this.dataset_element_id,
                this.feedback_text,
                this.customer_email,
                this.location_latitude,
                this.location_longitude,
                this.due_date
            ]
        };
        return query;
    }
}
