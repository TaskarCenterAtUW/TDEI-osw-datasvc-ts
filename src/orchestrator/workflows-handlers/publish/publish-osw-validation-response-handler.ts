import { QueueMessage } from "nodets-ms-core/lib/core/queue";
import EventEmitter from "events";
import { WorkflowHandlerBase } from "../../models/orchestrator-base-model";
import { IOrchestratorService } from "../../services/orchestrator-service";

export class PublishValidationResponseHandler extends WorkflowHandlerBase {

    constructor(workflowEvent: EventEmitter, orchestratorServiceInstance: IOrchestratorService) {
        super(workflowEvent, orchestratorServiceInstance, "OSW_PUBLISH_VALIDATION_RESPONSE_HANDLER");
    }

    /**
     * 
     * @param message 
     * @param delegate_worflow 
     * @param params 
     */
    override async handleRequest(message: QueueMessage, delegate_worflow: string[], params: any): Promise<void> {
        console.log(`Triggered ${this.eventName} :`, message.messageType);

        if (message.data.success)
            this.delegateWorkflowIfAny(delegate_worflow, message);
    }
}