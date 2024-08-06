/**
 * Class to hold the response of osw on demand format request
 * 
 */
import { IsNotEmpty } from "class-validator";
import { AbstractDomainEntity, Prop } from "nodets-ms-core/lib/models";

export class OswFormatJobResponse extends AbstractDomainEntity {

    @Prop()
    @IsNotEmpty()
    jobId!: string

    @Prop()
    @IsNotEmpty()
    sourceUrl!: string

    @Prop()
    @IsNotEmpty()
    status!: string

    @Prop()
    @IsNotEmpty()
    formattedUrl!: string

    @Prop()
    @IsNotEmpty()
    message!: string

    @Prop()
    @IsNotEmpty()
    success!: boolean;
}