import { QueueMessage } from "nodets-ms-core/lib/core/queue";
import appContext from "../../../server";
import { IWorkflowRegister } from "../../models/config-model";
import EventEmitter from "events";

export class PublishHandler implements IWorkflowRegister {

    constructor(private workflowEvent: EventEmitter) {
    }

    register(): void {
        this.workflowEvent.on("PUBLISH_HANDLER", this.handleWorkflow);
    }
    /**
     * 
     * @param message 
     * @param delegate_worflow 
     * @param params 
     */
    private async handleWorkflow(message: QueueMessage, delegate_worflow: string[], params: any) {
        console.log("Triggered PUBLISH_HANDLER :", message.messageType);
        message.messageType = params.identifier;
        //TODO:: Update the workflow history with latest message type
        await appContext.orchestratorServiceInstance.publishMessage(params.topic, message)
        appContext.orchestratorServiceInstance.delegateWorkflowIfAny(delegate_worflow, message);
    }
}