import { QueueMessage } from "nodets-ms-core/lib/core/queue";
import appContext from "../../../app-context";
import EventEmitter from "events";
import { WorkflowHandlerBase } from "../../models/orchestrator-base";

export class UploadValidationResponseHandler extends WorkflowHandlerBase {

    constructor(workflowEvent: EventEmitter) {
        super(workflowEvent, "OSW_UPLOAD_VALIDATION_RESPONSE_HANDLER");
    }

    /**
     * 
     * @param message 
     * @param delegate_worflow 
     * @param params 
     */
    override async handleRequest(message: QueueMessage, delegate_worflow: string[], params: any): Promise<void> {
        console.log("Triggered OSW_UPLOAD_VALIDATION_RESPONSE_HANDLER :", message.messageType);

        appContext.orchestratorServiceInstance!.delegateWorkflowIfAny(delegate_worflow, message);
    }
}