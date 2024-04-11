import App from './app';
import dotenv from 'dotenv';
import "reflect-metadata";
import oswController from './controller/osw-controller';
import healthController from './controller/health-controller';
import { environment } from './environment/environment';
import generalController from './controller/general-controller';
import flexController from './controller/flex-controller';
import pathwaysController from './controller/pathways-controller';

//Load environment variables
dotenv.config()

const PORT: number = environment.appPort;

const appContext = new App(
    [
        oswController,
        healthController,
        generalController,
        flexController,
        pathwaysController
    ],
    PORT,
);
appContext.listen();
