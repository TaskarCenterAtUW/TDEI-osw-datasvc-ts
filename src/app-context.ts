import { IOrchestratorService } from "./orchestrator/services/orchestrator-service";

export interface IAppContext {
    orchestratorServiceInstance?: IOrchestratorService;
}

class AppContext implements IAppContext {
    orchestratorServiceInstance!: IOrchestratorService;
}

const appContext = new AppContext();
export default appContext;