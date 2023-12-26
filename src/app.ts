
import express, { NextFunction, Request, Response } from "express";
import bodyParser from "body-parser";
import { IController } from "./controller/interface/IController";
import helmet from "helmet";
import { Core } from "nodets-ms-core";
import { unhandledExceptionAndRejectionHandler } from "./middleware/unhandled-exception-rejection-handler";
import dbClient from "./database/data-source";
import HttpException from "./exceptions/http/http-base-exception";
import { IOrchestratorService, OrchestratorService } from "./orchestrator/services/orchestrator-service";
import orchestratorConfig from "./tdei-orchestrator-config.json";
import handlers from "./orchestrator/workflows-handlers";
import { IWorkflowRegister } from "./orchestrator/models/config-model";
import EventEmitter from "events";
import appContext from "./app-context";

class App {
    private app: express.Application;
    private port: number;
    private orchestratorService: IOrchestratorService | undefined;
    private workflowEvent = new EventEmitter();

    constructor(controllers: IController[], port: number) {
        this.app = express();
        this.port = port;
        //First middleware to be registered: after express init
        unhandledExceptionAndRejectionHandler();

        this.initializeMiddlewares();
        this.initializeControllers(controllers);
        this.initializeLibraries();
        dbClient.initializaDatabase();
        this.initializeOrchestrator();
        //Last middleware to be registered: error handler. 
        // this.app.use(errorHandler); // Not working

        this.app.use((err: any, req: Request, res: Response, next: NextFunction) => {
            console.log(err);
            if (err instanceof HttpException) {
                res.status(err.status).send(err.message);
            }
            else {
                res.status(500).send('Application error occured');
            }
        });
    }

    private initializeOrchestrator() {
        if (!this.orchestratorService)
            this.orchestratorService = new OrchestratorService(orchestratorConfig, this.workflowEvent);
        //Register all handlers and workflow
        console.log("Registering the orchestration workflow and handlers");
        const uniqueArray = [...new Set(handlers)];
        uniqueArray.forEach(x => {
            let handler: IWorkflowRegister = new x(this.workflowEvent);
            handler.register();
        });
        //Validate the workflow and handlers defined in configuration are registered in the Orchestrator engine
        this.orchestratorService.validateDeclaredVsRegisteredWorkflowHandlers();

        appContext.orchestratorServiceInstance = this.orchestratorService;
    }

    public get orchestratorServiceInstance() {
        if (!this.orchestratorService)
            this.initializeOrchestrator();
        return this.orchestratorService!;
    }

    private initializeLibraries() {
        Core.initialize();
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
