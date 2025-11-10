import { AbstractDomainEntity, Prop } from "nodets-ms-core/lib/models";
import { IsNotEmpty, IsEmail, IsNumber, IsOptional, validate, ValidationError, IsString } from "class-validator";
import { InputException } from "../exceptions/http/http-exceptions";

export class FeedbackRequestDto extends AbstractDomainEntity {

    //Request props
    @Prop()
    @IsNotEmpty()
    @IsString()
    tdei_project_id!: string;

    @Prop()
    @IsNotEmpty()
    @IsString()
    tdei_dataset_id!: string;

    @Prop()
    @IsOptional()
    @IsString()
    dataset_element_id?: string;

    @Prop()
    @IsNotEmpty()
    @IsString()
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


export class FeedbackResponseDTO extends AbstractDomainEntity {
    @Prop()
    id!: number;
    @Prop()
    project_group!: {
        tdei_project_group_id: string;
        name: string;
    };
    @Prop()
    dataset!: {
        tdei_dataset_id: string;
        name: string;
    };
    @Prop()
    @IsOptional()
    @IsString()
    dataset_element_id?: string;

    @Prop()
    @IsNotEmpty()
    @IsString()
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

    @Prop()
    created_at!: string;
    @Prop()
    updated_at!: string;

    @Prop()
    status!: string;

    @Prop()
    due_date!: string;

    @Prop()
    resolution!: string;

    @Prop()
    resolution_description!: string;

    @Prop()
    resolved_by!: string;
}