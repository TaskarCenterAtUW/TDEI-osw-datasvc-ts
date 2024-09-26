
import express, { NextFunction, Request, Response } from "express";
import bodyParser from "body-parser";
import { IController } from "./controller/interface/IController";
import helmet from "helmet";
import { Core } from "nodets-ms-core";
import { unhandledExceptionAndRejectionHandler } from "./middleware/unhandled-exception-rejection-handler";
import dbClient from "./database/data-source";
import HttpException from "./exceptions/http/http-base-exception";
import { IOrchestratorService } from "./orchestrator/services/orchestrator-service";
import orchestratorConfig_v2 from "./tdei-orchestrator-config_v2.json";
// import orchestratorConfig_v2 from "./workflow_example.json";
import workflows_v2_register from "./orchestrator_v2/index";
import appContext from "./app-context";
import { IOrchestratorService_v2, OrchestratorService_v2 } from "./orchestrator_v2/orchestrator-service-v2";

class App {
    private app: express.Application;
    private port: number;
    private orchestratorService: IOrchestratorService | undefined;
    private orchestratorService_v2: IOrchestratorService_v2 | undefined;

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
        // if (!this.orchestratorService)
        //     this.orchestratorService = new OrchestratorService(orchestratorConfig);

        // this.orchestratorService.initialize(workflows);
        // appContext.orchestratorServiceInstance = this.orchestratorService;

        this.orchestratorService_v2 = new OrchestratorService_v2(orchestratorConfig_v2, workflows_v2_register);
        appContext.orchestratorService_v2_Instance = this.orchestratorService_v2;
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
        this.app.use(bodyParser.text());
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
