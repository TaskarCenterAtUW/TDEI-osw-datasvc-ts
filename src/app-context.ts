import { IOrchestratorService } from "./orchestrator/services/orchestrator-service";

export interface IAppContext {
    orchestratorServiceInstance: IOrchestratorService;
}

class AppContext implements IAppContext {
    orchestratorServiceInstance!: IOrchestratorService;
    constructor() {
    }
}

let appContext = new AppContext();
export default appContext;