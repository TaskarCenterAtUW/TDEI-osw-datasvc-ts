import { QueueMessage } from "nodets-ms-core/lib/core/queue";
import appContext from "../../../server";
import { IWorkflowRegister } from "../../models/config-model";
import EventEmitter from "events";

export class PublishValidationHandler implements IWorkflowRegister {

    constructor(private workflowEvent: EventEmitter) {
    }

    register(): void {
        console.log("Registering OSW_PUBLISH_VALIDATION_RESPONSE_HANDLER");
        this.workflowEvent.on("OSW_PUBLISH_VALIDATION_RESPONSE_HANDLER", this.handleMessage);
    }

    /**
     * 
     * @param message 
     * @param delegate_worflow 
     * @param params 
     */
    private handleMessage(message: QueueMessage, delegate_worflow: string[], params: any) {
        console.log("Triggered OSW_PUBLISH_VALIDATION_RESPONSE_HANDLER");

        appContext.orchestratorServiceInstance.delegateWorkflowIfAny(delegate_worflow, message, {});
    }
}