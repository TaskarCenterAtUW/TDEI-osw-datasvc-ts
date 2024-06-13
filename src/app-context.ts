import { IOrchestratorService } from "./orchestrator/services/orchestrator-service";
import { IOrchestratorServiceNew } from "./orchestrator/services/orchestrator-service-new";

export interface IAppContext {
    orchestratorServiceInstance: IOrchestratorService;
    orchestratorServiceNewInstance: IOrchestratorServiceNew;
}

class AppContext implements IAppContext {
    orchestratorServiceInstance!: IOrchestratorService;
    orchestratorServiceNewInstance!: IOrchestratorServiceNew;
    constructor() {
    }
}

let appContext = new AppContext();
export default appContext;