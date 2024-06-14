import { IOrchestratorService } from "./orchestrator/services/orchestrator-service";
import { IOrchestratorService_v2 } from "./orchestrator_v2/orchestrator-service-v2";

export interface IAppContext {
    orchestratorServiceInstance: IOrchestratorService;
    orchestratorService_v2_Instance: IOrchestratorService_v2;
}

class AppContext implements IAppContext {
    orchestratorServiceInstance!: IOrchestratorService;
    orchestratorService_v2_Instance!: IOrchestratorService_v2;
    constructor() {
    }
}

let appContext = new AppContext();
export default appContext;