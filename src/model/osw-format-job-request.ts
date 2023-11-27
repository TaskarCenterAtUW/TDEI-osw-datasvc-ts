/**
 * Class that holds the on demand formatting request data.
 * This is sent as a message to the formatting request
 * {
        "sourceUrl":"https://tdeisamplestorage.blob.core.windows.net/osw/formatter/uid/valid_c8c76e89f30944d2b2abd2491bd95337.zip",
        "jobId":"42",
        "source":"osw",
        "target":"osm"
    }
 */

import { IsNotEmpty } from "class-validator";
import { AbstractDomainEntity, Prop } from "nodets-ms-core/lib/models";

export class OswFormatJobRequest extends AbstractDomainEntity {

    @Prop()
    @IsNotEmpty()
    jobId!: string

    @Prop()
    @IsNotEmpty()
    source!: string

    @Prop()
    @IsNotEmpty()
    target!: string

    @Prop()
    @IsNotEmpty()
    sourceUrl!:string

}