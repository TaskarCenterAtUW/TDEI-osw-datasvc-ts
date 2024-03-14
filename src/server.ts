import App from './app';
import dotenv from 'dotenv';
import "reflect-metadata";
import oswController from './controller/osw-controller';
import healthController from './controller/health-controller';
import { environment } from './environment/environment';
import generalController from './controller/general-controller';

//Load environment variables
dotenv.config()

const PORT: number = environment.appPort;

const appContext = new App(
    [
        oswController,
        healthController,
        generalController
    ],
    PORT,
);
appContext.listen();
