import EventEmitter from "events";
import _ from "lodash";
import { WorkflowDetailsEntity } from "../../database/entity/workflow-details-entity";
import { OrchestratorFunctions } from "../services/orchestrator-functions";
import { WorkflowConfig, TaskConfig } from "./config-model-new";
import { WorkflowContext, Task } from "./workflow-context.model";
import { QueueMessage } from "nodets-ms-core/lib/core/queue";
import { IOrchestratorServiceNew } from "../services/orchestrator-service-new";
import { Utility } from "../../utility/utility";

export class workflowBase1 {

    constructor(private workflowEvent: EventEmitter, public orchestratorServiceInstance: IOrchestratorServiceNew, public eventName: string) {
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

export class UtilityHandler extends workflowBase1 {

    constructor(workflowEvent: EventEmitter, orchestratorServiceInstance: IOrchestratorServiceNew) {
        super(workflowEvent, orchestratorServiceInstance, "UTILITY_TASK_HANDLER");
    }

    async handleWorkflow(workflow: WorkflowConfig, task: TaskConfig, workflow_context: WorkflowContext): Promise<void> {
        console.log("Executing utility task", task.name);

        let inputParams = task.input_params;

        let messageInput: any = Utility.map_props(inputParams, workflow_context);
        if (messageInput == null) {
            console.error(`Unresolved input parameter for task : ${task.name}`);
            //TODO: Handle the error
        }

        workflow_context.tasks[task.name] = Task.from({
            name: task.name,
            input: messageInput
        });
        workflow_context.tasks[task.name].start();
        workflow_context.updateCurrentTask(workflow_context.tasks[task.name]);

        //Save the workflow context
        await this.saveWorkflowContext(workflow_context);

        let output = await OrchestratorFunctions.invokeMethod(task.name, messageInput);

        workflow_context.tasks[task.name].output = output;

        if (output.success) {
            workflow_context.tasks[task.name].completed();
            workflow_context.updateCurrentTask(workflow_context.tasks[task.name]);
        }
        else {
            workflow_context.tasks[task.name].fail(output.message);
            workflow_context.updateCurrentTask(workflow_context.tasks[task.name]);
        }
        //Save the workflow context
        await this.saveWorkflowContext(workflow_context);

        if (output.success) {
            await this.executeNextTask(workflow, task, workflow_context);
        }
        else {
            console.error(`Task failed for : ${task.name} , workflow : ${workflow.name}, execution_id : ${workflow_context.execution_id}`)
        }
        return Promise.resolve();
    }

}

export class EventHandler extends workflowBase1 {

    constructor(workflowEvent: EventEmitter, orchestratorServiceInstance: IOrchestratorServiceNew) {
        super(workflowEvent, orchestratorServiceInstance, "EVENT_TASK_HANDLER");
    }

    async handleWorkflow(workflow: WorkflowConfig, task: TaskConfig, workflow_context: WorkflowContext): Promise<void> {
        let inputParams = task.input_params;
        //Compose the input parameters
        let messageInput: any = Utility.map_props(inputParams, workflow_context);
        if (messageInput == null) {
            console.error(`Unresolved input parameter for task : ${task.name}`);
            //TODO: Handle the error
        }

        workflow_context.tasks[task.name] = Task.from({
            name: task.name,
            input: messageInput
        });
        workflow_context.tasks[task.name].start();
        workflow_context.updateCurrentTask(workflow_context.tasks[task.name]);

        //Publish the message
        let queueMessage = QueueMessage.from({
            messageId: workflow_context.execution_id,
            messageType: task.task_reference_name, //Workflow name + task name
            data: messageInput
        });

        await this.publishMessage(task.topic as string, queueMessage);

        //Save the workflow context
        await this.saveWorkflowContext(workflow_context);

        await this.executeNextTask(workflow, task, workflow_context);
        return Promise.resolve();
    }
}
