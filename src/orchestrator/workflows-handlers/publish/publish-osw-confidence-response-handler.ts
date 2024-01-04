import { QueueMessage } from "nodets-ms-core/lib/core/queue";
import EventEmitter from "events";
import { OSWConfidenceResponse } from "../../../model/osw-confidence-response";
import dbClient from "../../../database/data-source";
import { WorkflowHandlerBase } from "../../models/orchestrator-base-model";
import { IOrchestratorService } from "../../services/orchestrator-service";

export class PublishConfidenceResponseHandler extends WorkflowHandlerBase {

    constructor(workflowEvent: EventEmitter, orchestratorServiceInstance: IOrchestratorService) {
        super(workflowEvent, orchestratorServiceInstance, "OSW_PUBLISH_CONFIDENCE_RESPONSE_HANDLER");
    }

    /**
     * 
     * @param message 
     * @param delegate_worflow 
     * @param params 
     */
    override async handleRequest(message: QueueMessage, delegate_worflow: string[], params: any): Promise<void> {
        console.log(`Triggered ${this.eventName} :`, message.messageType);

        if (message.data.success) {
            try {
                const confidenceResponse = OSWConfidenceResponse.from(message.data);
                const oswUpdateQuery = confidenceResponse.getRecordUpdateQuery(message.messageId);
                await dbClient.query(oswUpdateQuery);
                this.delegateWorkflowIfAny(delegate_worflow, message);
            } catch (error) {
                console.error("Error updating the osw version confidence details", error);
                return;
            }
        }
    }
}