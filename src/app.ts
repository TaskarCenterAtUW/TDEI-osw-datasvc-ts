
import express from "express";
import bodyParser from "body-parser";
import { IController } from "./controller/interface/IController";
import helmet from "helmet";
import { Core } from "nodets-ms-core";
import { EventBusService } from "./service/event-bus-service";
import { unhandledExceptionAndRejectionHandler } from "./middleware/unhandled-exception-rejection-handler";
import { errorHandler } from "./middleware/error-handler-middleware";
import dbClient from "./database/data-source";

class App {
    public app: express.Application;
    public port: number;
    private eventBusService!: EventBusService;

    constructor(controllers: IController[], port: number) {
        this.app = express();
        this.port = port;
        //First middleware to be registered: after express init
        unhandledExceptionAndRejectionHandler();

        this.initializeMiddlewares();
        this.initializeControllers(controllers);
        this.subscribeUpload();
        this.initializeLibraries();
        dbClient.initializaDatabase();
        //Last middleware to be registered: error handler. 
        this.app.use(errorHandler);
    }

    initializeLibraries() {
        Core.initialize();
    }

    private subscribeUpload() {
        this.eventBusService = new EventBusService();
        this.eventBusService.subscribeUpload();
    }

    private initializeMiddlewares() {
        this.app.use(helmet());
        this.app.use(bodyParser.json());
    }

    private initializeControllers(controllers: IController[]) {
        controllers.forEach((controller) => {
            this.app.use('/', controller.router);
        });
    }

    public listen() {
        this.app.listen(this.port, () => {
            console.log(`App listening on the port ${this.port}`);
        });
    }
}

export default App;