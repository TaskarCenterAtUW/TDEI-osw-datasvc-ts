import EventEmitter from "events";
import { WorkflowBase } from "../../models/orchestrator-base-model";
import { GENERIC_WORKFLOW_IDENTIFIER } from "../../models/config-model";
import { IOrchestratorService } from "../../services/orchestrator-service";

// This is the generic workflow handler. 
//It is used to handle all the workflows that are not handled by the other workflow handlers.
export class GenericWorkflow extends WorkflowBase {

    constructor(workflowEvent: EventEmitter, orchestratorServiceInstance: IOrchestratorService) {
        super(workflowEvent, orchestratorServiceInstance, GENERIC_WORKFLOW_IDENTIFIER);
    }
}