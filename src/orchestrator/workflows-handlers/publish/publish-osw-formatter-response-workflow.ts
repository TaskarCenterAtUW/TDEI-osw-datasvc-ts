import { QueueMessage } from "nodets-ms-core/lib/core/queue";
import appContext from "../../../server";
import { IWorkflowRegister } from "../../models/config-model";
import EventEmitter from "events";

export class PublishFormattingResponseWorkflow implements IWorkflowRegister {

    constructor(private workflowEvent: EventEmitter) {
    }

    register(): void {
        this.workflowEvent.on("OSW_PUBLISH_FORMATTING_RESPONSE_WORKFLOW", this.handleWorkflow);
    }

    handleWorkflow(message: QueueMessage, params: any) {
        console.log("Triggered OSW_PUBLISH_FORMATTING_RESPONSE_WORKFLOW :", message.messageType);
        //do any pre-requisite task

        if (message.data.success)//trigger handlers
            appContext.orchestratorServiceInstance.delegateWorkflowHandlers(message);
    }
}