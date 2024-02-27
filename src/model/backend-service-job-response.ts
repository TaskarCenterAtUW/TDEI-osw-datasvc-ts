/**
 * Class to hold the response of osw on demand format request
 * 
 */
import { IsNotEmpty } from "class-validator";
import { AbstractDomainEntity, Prop } from "nodets-ms-core/lib/models";

export class BackendServiceJobResponse extends AbstractDomainEntity {

    @Prop()
    @IsNotEmpty()
    job_id!: string

    @Prop()
    @IsNotEmpty()
    status!: string

    @Prop()
    @IsNotEmpty()
    file_upload_path!: string

    @Prop()
    @IsNotEmpty()
    message!: string
}