import { IsNotEmpty } from 'class-validator';
import { Prop } from 'nodets-ms-core/lib/models';
import { BaseDto } from '../../model/base-dto';

export class WorkflowHistoryEntity extends BaseDto {

    @Prop()
    history_id!: number;
    @Prop()
    @IsNotEmpty()
    reference_id!: string;
    @Prop()
    @IsNotEmpty()
    workflow_group!: string;
    @Prop()
    @IsNotEmpty()
    request_message!: string;
    @Prop()
    response_message!: string;
    @Prop()
    workflow_stage!: string;
    @Prop()
    @IsNotEmpty()
    message!: string;
    @Prop()
    status!: string;

    constructor(init?: Partial<WorkflowHistoryEntity>) {
        super();
        Object.assign(this, init);
    }
}