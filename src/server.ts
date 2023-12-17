import App, { IAppContext } from './app';
import dotenv from 'dotenv';
import "reflect-metadata";
import oswController from './controller/osw-controller';
import healthController from './controller/health-controller';
import { environment } from './environment/environment';

//Load environment variables
dotenv.config()

const PORT: number = environment.appPort;

const appContext = new App(
    [
        oswController,
        healthController
    ],
    PORT,
);
appContext.listen();

export default appContext as IAppContext;