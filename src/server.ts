import App from './app';
import dotenv from 'dotenv';
import "reflect-metadata";
import oswController from './controller/osw-controller';
import healthController from './controller/health-controller';
import { environment } from './environment/environment';

//Load environment variables
dotenv.config()

const PORT: number = environment.appPort;

new App(
    [
        oswController,
        healthController
    ],
    PORT,
).listen();