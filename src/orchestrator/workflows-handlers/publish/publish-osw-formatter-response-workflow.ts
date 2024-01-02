import { QueueMessage } from "nodets-ms-core/lib/core/queue";
import appContext from "../../../app-context";
import EventEmitter from "events";
import { WorkflowBase } from "../../models/orchestrator-base";

export class PublishFormattingResponseWorkflow extends WorkflowBase {

    constructor(workflowEvent: EventEmitter) {
        super(workflowEvent, "OSW_PUBLISH_FORMATTING_RESPONSE_WORKFLOW");
    }

    async handleWorkflow(message: QueueMessage, params: any): Promise<void> {
        console.log("Triggered OSW_PUBLISH_FORMATTING_RESPONSE_WORKFLOW :", message.messageType);
        //do any pre-requisite task

        if (message.data.success)//trigger handlers
            appContext.orchestratorServiceInstance!.delegateWorkflowHandlers(message);
    }
}