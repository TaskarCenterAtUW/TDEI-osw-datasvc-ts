import { AbstractDomainEntity, Prop } from "nodets-ms-core/lib/models";
import { IsOptional, IsString, IsIn, IsNotEmpty, validate, ValidationError, IsNumber } from "class-validator";
import { InputException } from "../exceptions/http/http-exceptions";

export class FeedbackStatusRequestDto extends AbstractDomainEntity {
    @Prop()
    @IsNotEmpty()
    @IsIn(['open', 'resolved'], {
        message: "status must be either 'open' or 'resolved'",
    })
    status?: string;

    @Prop()
    @IsOptional()
    @IsIn(['fixed', 'wont_fix', 'not_an_issue'], {
        message: "resolution must be either 'fixed', 'wont_fix' or 'not_an_issue'",
    })
    resolution_status?: string;

    @Prop()
    @IsOptional()
    @IsString()
    resolution_description?: string;

    @Prop()
    @IsNotEmpty()
    @IsNumber()
    id?: number;

    async validateRequestInput() {
        let errors = await validate(this);
        if (errors.length > 0) {
            console.log('Input validation failed');
            let message = errors.map((error: ValidationError) => Object.values(<any>error.constraints)).join(', ');
            throw new InputException(`Required fields are missing or invalid: ${message}`);
        }
        return true;
    }
}


export class FeedbackStatusUpdateResponseDto {
    id!: number;
    message!: string;
    status!: "Success" | "Failed";

    constructor(init?: Partial<FeedbackStatusUpdateResponseDto>) {
        Object.assign(this, init);
    }
}
