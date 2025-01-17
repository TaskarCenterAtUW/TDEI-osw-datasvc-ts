import { AbstractDomainEntity, Prop } from "nodets-ms-core/lib/models";


export class DownloadStatsDTO extends AbstractDomainEntity {
    @Prop()
    user_id!: string;
    @Prop()
    requested_datetime!: string;
    @Prop()
    blob_url!: string;
    @Prop()
    file_size!: number;
    @Prop()
    tdei_dataset_id!: string;
    @Prop()
    data_type!: string;
}