import EventEmitter from "events";
import { WorkflowBase } from "../../models/orchestrator-base-model";
import { IOrchestratorService } from "../../services/orchestrator-service";

export class PublishValidationRequestWorkflow extends WorkflowBase {

    constructor(workflowEvent: EventEmitter, orchestratorServiceInstance: IOrchestratorService) {
        super(workflowEvent, orchestratorServiceInstance, "OSW_PUBLISH_VALIDATION_REQUEST_WORKFLOW");
    }
}