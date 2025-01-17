import { Prop } from 'nodets-ms-core/lib/models';
import { BaseDto } from '../../model/base-dto';
import { QueryConfig } from 'pg';
import { DownloadStatsDTO } from '../../model/download-stats-dto';

export class DownloadStatsEntity extends BaseDto {
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

    constructor(init?: Partial<DownloadStatsEntity>) {
        super();
        Object.assign(this, init);
    }

    /**
     * Returns the query configuration for creating a download in the database.
     * @param downloadStats - The job object containing the necessary data for creating a download stats.
     * @returns The query configuration object.
     */
    static getCreateDownloadStatsQuery(downloadStats: DownloadStatsDTO): QueryConfig {
        const query = {
            text: 'INSERT INTO content.download_stats (user_id, requested_datetime, blob_url, file_size, tdei_dataset_id, data_type ) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
            values: [downloadStats.user_id, downloadStats.requested_datetime, downloadStats.blob_url, downloadStats.file_size, downloadStats.tdei_dataset_id, downloadStats.data_type],
        }
        return query;
    }
}