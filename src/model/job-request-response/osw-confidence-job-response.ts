import { IsNotEmpty } from "class-validator";
import { AbstractDomainEntity, Prop } from "nodets-ms-core/lib/models";

/**
 * Class that holds data response from the confidence metric service
 * Eg.
 * {
    jobId: '22',
    confidence_level: '90.0',
    confidence_library_version: 'v1.0',
    status: 'finished',
    message: 'Processed successfully'
  }
 */
export class ConfidenceJobResponse extends AbstractDomainEntity {

    @Prop()
    @IsNotEmpty()
    jobId!: string

    @Prop()
    @IsNotEmpty()
    confidence_scores!: any;

    @Prop()
    @IsNotEmpty()
    confidence_library_version!: string

    @Prop()
    @IsNotEmpty()
    status!: string

    @Prop()
    message: string = '';

    @Prop()
    @IsNotEmpty()
    success: boolean = false;

    constructor(init?: Partial<ConfidenceJobResponse>) {
        super();
        Object.assign(this, init);
    }
}