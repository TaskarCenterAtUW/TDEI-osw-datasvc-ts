import EventEmitter from "events";
import { QueueMessage } from "nodets-ms-core/lib/core/queue";

export abstract class WorkflowBase {

    constructor(private workflowEvent: EventEmitter, eventName: string) {
        this.workflowEvent.on(eventName, this.handleWorkflow);
    }

    abstract handleWorkflow(message: QueueMessage, params: any): Promise<void>;
}

export abstract class WorkflowHandlerBase {

    constructor(private workflowEvent: EventEmitter, eventName: string) {
        this.workflowEvent.on(eventName, this.handleRequest);
    }

    abstract handleRequest(message: QueueMessage, delegate_worflow: string[], params: any): Promise<void>;
} 