/**
 * Class to hold the response of osw on demand format request
 * 
 */
import { IsNotEmpty } from "class-validator";
import { AbstractDomainEntity, Prop } from "nodets-ms-core/lib/models";

export class DataFlatteningJobResponse extends AbstractDomainEntity {

    @Prop()
    @IsNotEmpty()
    ref_id!: string;

    @Prop()
    @IsNotEmpty()
    status!: string;

    @Prop()
    @IsNotEmpty()
    message!: string;
}