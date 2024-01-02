import { QueueMessage } from "nodets-ms-core/lib/core/queue";
import appContext from "../../../app-context";
import EventEmitter from "events";
import { WorkflowBase } from "../../models/orchestrator-base";

export class ValidationOnlyValidationRequestWorkflow extends WorkflowBase {

    constructor(workflowEvent: EventEmitter) {
        super(workflowEvent, "OSW_VALIDATION_ONLY_VALIDATION_REQUEST_WORKFLOW");
    }

    async handleWorkflow(message: QueueMessage, params: any): Promise<void> {
        console.log("Triggered OSW_VALIDATION_ONLY_VALIDATION_REQUEST_WORKFLOW :", message.messageType);
        //do any pre-requisite task

        //trigger handlers
        appContext.orchestratorServiceInstance!.delegateWorkflowHandlers(message);
    }
}