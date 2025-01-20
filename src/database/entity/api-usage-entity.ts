import { Prop } from 'nodets-ms-core/lib/models';
import { BaseDto } from '../../model/base-dto';
import { QueryConfig } from 'pg';

export class APIUsageSummaryEntity extends BaseDto {
    @Prop()
    endpoint!: string;

    constructor(init?: Partial<APIUsageSummaryEntity>) {
        super();
        Object.assign(this, init);
    }


    /**
     * Returns the query configuration for creating or updating API usage summary in the database.
     * If a record exists for the same `api_endpoint` and the current date, the `call_count` is incremented by 1.
     * Otherwise, a new record is inserted with `call_count = 1`.
     * 
     * @param apiEndpoint - The API endpoint being tracked.
     * @returns The query configuration object.
     */
    static getUpsertApiUsageSummaryQuery(apiEndpoint: string): QueryConfig {
        const query = {
            text: `
                INSERT INTO content.api_usage_summary (endpoint, count, date)
                VALUES ($1, 1, CURRENT_DATE)
                ON CONFLICT (endpoint, date)
                DO UPDATE SET count = content.api_usage_summary.count + 1
                RETURNING *;
            `,
            values: [apiEndpoint],
        };
        return query;
    }
}


export class APIUsageDetailsEntity extends BaseDto {
    @Prop()
    endpoint!: string;
    @Prop()
    method!: string;
    @Prop()
    client_ip!: string;
    @Prop()
    user_id!: string;
    @Prop()
    request_params?: object; // Optional, to store the request payload

    constructor(init?: Partial<APIUsageDetailsEntity>) {
        super();
        Object.assign(this, init);
    }

    /**
     * Returns the query configuration for inserting detailed API usage logs into the database.
     * Each API call is logged as a separate row.
     * 
     * @param details - The details of the API call to be logged.
     * @returns The query configuration object.
     */
    static getCreateAPIUsageDetailsQuery(details: Partial<APIUsageDetailsEntity>): QueryConfig {
        const query = {
            text: `
                INSERT INTO content.api_usage_details (
                    endpoint,
                    method,
                    client_ip,
                    user_id,
                    request_params,
                    timestamp
                )
                VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
                RETURNING *;
            `,
            values: [
                details.endpoint,
                details.method,
                details.client_ip,
                details.user_id,
                details.request_params ? JSON.stringify(details.request_params) : null
            ],
        };
        return query;
    }
}