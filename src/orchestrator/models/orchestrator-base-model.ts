import EventEmitter from "events";
import { QueueMessage } from "nodets-ms-core/lib/core/queue";
import { IOrchestratorService } from "../services/orchestrator-service";

//Base class for all workflows
export abstract class WorkflowBase {

    constructor(private workflowEvent: EventEmitter, public orchestratorServiceInstance: IOrchestratorService, public eventName: string) {
        this.workflowEvent.on(eventName, this.handleWorkflow);
    }

    /**
     * Delegate workflow handlers
     * @param message 
     */
    readonly delegateWorkflowHandlers = (message: QueueMessage) => {
        this.orchestratorServiceInstance!.delegateWorkflowHandlers(message);
    }

    /**
     * Handle workflow
     * @param message 
     * @param params 
     */
    //Default implemnetation. Can be overriden by child classes
    async handleWorkflow(message: QueueMessage, params: any): Promise<void> {
        console.log(`Triggered ${this.eventName} :`, message.messageType);
        //do any pre-requisite task

        //trigger handlers
        this.delegateWorkflowHandlers(message);
        return Promise.resolve();
    }
}

//Base class for all workflow handlers
export abstract class WorkflowHandlerBase {

    constructor(private workflowEvent: EventEmitter, public orchestratorServiceInstance: IOrchestratorService, public eventName: string) {
        this.workflowEvent.on(eventName, this.handleRequest);
    }

    /**
     * delegate workflow if any
     * @param delegate_worflow 
     * @param message 
     */
    readonly delegateWorkflowIfAny = (delegate_worflow: string[], message: QueueMessage) => {
        this.delegateWorkflowIfAny(delegate_worflow, message);
    }

    /**
         * handle request
         * @param message 
         * @param delegate_worflow 
         * @param params 
         */
    //Default implemnetation. Can be overriden by child classes
    async handleRequest(message: QueueMessage, delegate_worflow: string[], params: any): Promise<void> {
        console.log(`Triggered ${this.eventName} :`, message.messageType);

        if (message.data.success)
            this.orchestratorServiceInstance!.delegateWorkflowIfAny(delegate_worflow, message);
    }
} 