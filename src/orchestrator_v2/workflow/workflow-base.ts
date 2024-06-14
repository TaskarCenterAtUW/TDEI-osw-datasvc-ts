import EventEmitter from "events";
import _ from "lodash";
import { WorkflowDetailsEntity } from "../../database/entity/workflow-details-entity";
import { WorkflowConfig, TaskConfig } from "./workflow-config-model";
import { WorkflowContext } from "./workflow-context.model";
import { QueueMessage } from "nodets-ms-core/lib/core/queue";
import { IOrchestratorService_v2 } from "../orchestrator-service-v2";

export class workflowBase_v2 {

    constructor(private workflowEvent: EventEmitter, public orchestratorServiceInstance: IOrchestratorService_v2, public eventName: string) {
        this.workflowEvent.on(eventName, this.handleWorkflow.bind(this));
    }

    async executeNextTask(workflow: WorkflowConfig, task: TaskConfig, workflow_context: any) {
        await this.orchestratorServiceInstance.executeNextTask(workflow, task, workflow_context);
    }

    async publishMessage(topic: string, message: QueueMessage) {
        await this.orchestratorServiceInstance.publishMessage(topic, message);
    }

    async saveWorkflowContext(workflow_context: WorkflowContext) {
        await WorkflowDetailsEntity.saveWorkflowContext(workflow_context.execution_id, workflow_context);
    }


    /**
     * Handle workflow
     * @param message 
     * @param params 
     */
    //Default implemnetation. Can be overriden by child classes
    async handleWorkflow(workflow: WorkflowConfig, task: TaskConfig | undefined, workflow_context: WorkflowContext): Promise<void> {
        console.log(`Triggered ${this.eventName} : Task : `, task?.name);
        return Promise.resolve();
    }
}
