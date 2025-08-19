import { AbstractDomainEntity, Prop } from "nodets-ms-core/lib/models";
import { IsNotEmpty, IsEmail, IsNumber, IsOptional, validate, ValidationError } from "class-validator";
import { InputException } from "../exceptions/http/http-exceptions";

export class FeedbackDto extends AbstractDomainEntity {

    //Request props
    @Prop()
    @IsNotEmpty()
    tdei_project_id!: string;

    @Prop()
    @IsNotEmpty()
    tdei_dataset_id!: string;

    @Prop()
    @IsOptional()
    dataset_element_id?: string;

    @Prop()
    @IsNotEmpty()
    feedback_text!: string;

    @Prop()
    @IsNotEmpty()
    @IsEmail()
    customer_email!: string;

    @Prop()
    @IsNotEmpty()
    @IsNumber()
    location_latitude!: number;

    @Prop()
    @IsNotEmpty()
    @IsNumber()
    location_longitude!: number;

    //Response props
    @Prop()
    @IsOptional()
    status!: string;

    @Prop()
    @IsOptional()
    created_at!: string;

    @Prop()
    @IsOptional()
    updated_at!: string;

    @Prop()
    @IsOptional()
    due_date!: string;

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