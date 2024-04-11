import { QueueMessage } from "nodets-ms-core/lib/core/queue";
import EventEmitter from "events";
import workflowDatabaseService from "../../services/workflow-database-service";
import { WorkflowHandlerBase } from "../../models/orchestrator-base-model";
import { IOrchestratorService } from "../../services/orchestrator-service";

export class PublishHandler extends WorkflowHandlerBase {
    constructor(workflowEvent: EventEmitter, orchestratorServiceInstance: IOrchestratorService) {
        super(workflowEvent, orchestratorServiceInstance, "PUBLISH_HANDLER");
    }

    /**
     * 
     * @param message 
     * @param delegate_worflow 
     * @param params 
     */
    public async handleRequest(message: QueueMessage, delegate_worflow: string[], params: any): Promise<void> {
        console.log("Triggered PUBLISH_HANDLER :", message.messageType);
        message.messageType = params.response_message_identifier;

        const trigger_workflow = this.orchestratorServiceInstance?.getWorkflowByIdentifier(message.messageType);
        workflowDatabaseService.updateWorkflowRequest(trigger_workflow?.stage ?? "", message);

        await this.orchestratorServiceInstance?.publishMessage(params.topic, message)
        this.orchestratorServiceInstance?.delegateWorkflowIfAny(delegate_worflow, message);
    }
}
