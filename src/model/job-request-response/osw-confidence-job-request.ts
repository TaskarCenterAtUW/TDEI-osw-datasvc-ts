/**
 * Class that holds the data for an OSW confidence metric request message
 * {
    "jobId":"<auto-incremented jobId>",
    "data_file":"<url to the data zip file in TDEI blob storage>",
    "meta_file":"<url to the meta file in TDEI blob storage>",
    "trigger_type":"<manual, release, scheduled>"
}

 */

import { IsIn, IsNotEmpty } from "class-validator";
import { AbstractDomainEntity, Prop } from "nodets-ms-core/lib/models";

export class OSWConfidenceJobRequest extends AbstractDomainEntity {
    @Prop()
    @IsNotEmpty()
    jobId!: string

    @Prop()
    @IsNotEmpty()
    data_file!: string

    @Prop()
    @IsNotEmpty()
    meta_file!: string

    @Prop()
    @IsIn(['manual', 'release', 'scheduled'])
    trigger_type!: string

    constructor(init?: Partial<OSWConfidenceJobRequest>) {
        super();
        Object.assign(this, init);
    }
}