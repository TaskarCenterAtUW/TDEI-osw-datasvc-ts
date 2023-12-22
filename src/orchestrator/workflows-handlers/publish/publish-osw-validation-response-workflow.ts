import { QueueMessage } from "nodets-ms-core/lib/core/queue";
import appContext from "../../../server";
import { IWorkflowRegister } from "../../models/config-model";
import EventEmitter from "events";

export class PublishValidationResponseWorkflow implements IWorkflowRegister {

    constructor(private workflowEvent: EventEmitter) {
    }

    register(): void {
        this.workflowEvent.on("OSW_PUBLISH_VALIDATION_RESPONSE_WORKFLOW", this.handleWorkflow);
    }

    handleWorkflow(message: QueueMessage, params: any) {
        console.log("Triggered OSW_PUBLISH_VALIDATION_RESPONSE_WORKFLOW");
        //do any pre-requisite tasks

        if (message.data.success) //trigger handlers
            appContext.orchestratorServiceInstance.delegateWorkflowHandlers(message);
    }
}