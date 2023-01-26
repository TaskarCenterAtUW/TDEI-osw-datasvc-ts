import { Pool, PoolClient, QueryConfig, QueryResult } from 'pg';
import { PostgresError } from '../constants/pg-error-constants';
import { environment } from '../environment/environment';
import UniqueKeyDbException, { ForeignKeyDbException } from '../exceptions/db/database-exceptions';

class DataSource {
    private pool: Pool;

    constructor() {
        console.info("Initializing database !");
        this.pool = new Pool({
            database: environment.database.database,
            host: environment.database.host,
            user: environment.database.username,
            password: environment.database.password,
            ssl: environment.database.ssl,
            port: environment.database.port
        });

        this.pool.on('error', function (err: Error, _client: any) {
            console.log(`Idle-Client Error:\n${err.message}\n${err.stack}`)
        }).on('connect', () => {
            console.log("Database initialized successfully !");
        });

    }

    /**
     * Async Query
     * @param sqlText 
     * @param params 
     * @returns 
     */
    async query(queryTextOrConfig: string | QueryConfig<any[]>, params: any[] = []): Promise<QueryResult<any>> {
        const client = await this.pool.connect()
        try {
            if (queryTextOrConfig instanceof String) {
                const result = await client.query(queryTextOrConfig, params);
                return result;
            }
            else {
                const result = await client.query(queryTextOrConfig);
                return result;
            }

        } catch (e: any) {

            switch (e.code) {
                case PostgresError.UNIQUE_VIOLATION:
                    throw new UniqueKeyDbException("Duplicate");
                case PostgresError.FOREIGN_KEY_VIOLATION:
                    throw new ForeignKeyDbException(e.constraint);
                default:
                    break;
            }

            throw e;
        } finally {
            client.release();
        }
    }

    /**
     * Create a client using one of the pooled connections
     *
     * @return client
     */
    private async connect(): Promise<PoolClient> {
        const client = await this.pool.connect();
        return client;
    }
}

const dbClient = new DataSource();
export default dbClient;