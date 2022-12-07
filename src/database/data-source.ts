import "reflect-metadata";
import { DataSource } from "typeorm";
import dotenv from 'dotenv';
import { environment } from "../environment/environment";

dotenv.config();

export const AppDataSource = new DataSource({
    type: "postgres",
    host: environment.database.host,
    port: environment.database.port,
    username: environment.database.username,
    password: environment.database.password,
    database: environment.database.database,
    synchronize: true,
    logging: true,
    migrations: [__dirname + '/../../database/migrations/*.{ts,js}'],
    entities: [__dirname + '/../database/entity/*.{ts,js}'],
    subscribers: [],
    ssl: environment.database.ssl
})
