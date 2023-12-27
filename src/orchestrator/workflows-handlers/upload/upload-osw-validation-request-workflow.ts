import { QueueMessage } from "nodets-ms-core/lib/core/queue";
import appContext from "../../../app-context";
import { IWorkflowRegister } from "../../models/config-model";
import EventEmitter from "events";

export class UploadValidationRequestWorkflow implements IWorkflowRegister {

    constructor(private workflowEvent: EventEmitter) {
    }

    register(): void {
        this.workflowEvent.on("OSW_UPLOAD_VALIDATION_REQUEST_WORKFLOW", this.handleWorkflow);
    }

    handleWorkflow(message: QueueMessage, params: any) {
        console.log("Triggered OSW_UPLOAD_VALIDATION_REQUEST_WORKFLOW :", message.messageType);
        //do any pre-requisite task

        //trigger handlers
        appContext.orchestratorServiceInstance!.delegateWorkflowHandlers(message);
    }
}