import { QueueMessage } from "nodets-ms-core/lib/core/queue";
import appContext from "../../../server";
import { IWorkflowRegister } from "../../models/config-model";
import EventEmitter from "events";

export class PublishValidationWorkflow implements IWorkflowRegister {

    constructor(private workflowEvent: EventEmitter) {
    }

    register(): void {
        console.log("Registering OSW_PUBLISH_VALIDATION_WORKFLOW");
        this.workflowEvent.on("OSW_PUBLISH_VALIDATION_WORKFLOW", this.handleWorkflow);
    }

    handleWorkflow(message: QueueMessage, params: any) {
        console.log("Triggered OSW_PUBLISH_VALIDATION_WORKFLOW");
        //do any pre-requisite tasks

        //trigger handlers
        appContext.orchestratorServiceInstance.delegateWorkflowHandlers(message);
    }
}