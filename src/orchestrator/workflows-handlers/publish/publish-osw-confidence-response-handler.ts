import { QueueMessage } from "nodets-ms-core/lib/core/queue";
import appContext from "../../../app-context";
import { IWorkflowRegister } from "../../models/config-model";
import EventEmitter from "events";
import { OSWConfidenceResponse } from "../../../model/osw-confidence-response";
import dbClient from "../../../database/data-source";

export class PublishConfidenceResponseHandler implements IWorkflowRegister {

    constructor(private workflowEvent: EventEmitter) {
    }

    register(): void {
        this.workflowEvent.on("OSW_PUBLISH_CONFIDENCE_RESPONSE_HANDLER", this.handleMessage);
    }

    /**
     * 
     * @param message 
     * @param delegate_worflow 
     * @param params 
     */
    private async handleMessage(message: QueueMessage, delegate_worflow: string[], params: any) {
        console.log("Triggered OSW_PUBLISH_CONFIDENCE_RESPONSE_HANDLER :", message.messageType);

        if (message.data.success) {
            try {
                const confidenceResponse = OSWConfidenceResponse.from(message.data);
                const oswUpdateQuery = confidenceResponse.getRecordUpdateQuery(message.messageId);
                await dbClient.query(oswUpdateQuery);
                appContext.orchestratorServiceInstance!.delegateWorkflowIfAny(delegate_worflow, message);
            } catch (error) {
                console.error("Error updating the osw version confidence details", error);
                return;
            }
        }
    }
}