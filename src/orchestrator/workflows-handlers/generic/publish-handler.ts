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
        let topic = params.topic;
        let message_type = params.identifier;
        message.messageType = message_type;
        //Do job publishing to queue
        await appContext.orchestratorServiceInstance.publishMessage(topic, message)
        appContext.orchestratorServiceInstance.delegateWorkflowIfAny(delegate_worflow, message, {});
    }
}