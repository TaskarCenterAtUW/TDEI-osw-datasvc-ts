import { QueueMessage } from "nodets-ms-core/lib/core/queue";
import appContext from "../../../app-context";
import EventEmitter from "events";
import workflowDatabaseService from "../../services/workflow-database-service";
import { WorkflowHandlerBase } from "../../models/orchestrator-base";

export class PublishHandler extends WorkflowHandlerBase {
    constructor(workflowEvent: EventEmitter) {
        super(workflowEvent, "PUBLISH_HANDLER");
    }

    /**
     * 
     * @param message 
     * @param delegate_worflow 
     * @param params 
     */
    public async handleRequest(message: QueueMessage, delegate_worflow: string[], params: any): Promise<void> {
        console.log("Triggered PUBLISH_HANDLER :", message.messageType);
        message.messageType = params.response_message_identifier;

        let trigger_workflow = appContext.orchestratorServiceInstance!.orchestratorContext.getWorkflowByIdentifier(message.messageType);
        workflowDatabaseService.updateWorkflowRequest(trigger_workflow?.stage!, message);

        await appContext.orchestratorServiceInstance!.publishMessage(params.topic, message)
        appContext.orchestratorServiceInstance!.delegateWorkflowIfAny(delegate_worflow, message);
    }
}
