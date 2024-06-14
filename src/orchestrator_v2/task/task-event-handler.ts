import EventEmitter from "events";
import _ from "lodash";
import { WorkflowDetailsEntity } from "../../database/entity/workflow-details-entity";
import { OrchestratorFunctions } from "./task-functions";
import { WorkflowConfig, TaskConfig } from "../workflow/workflow-config-model";
import { WorkflowContext, Task } from "../workflow/workflow-context.model";
import { QueueMessage } from "nodets-ms-core/lib/core/queue";
import { IOrchestratorService_v2 } from "../orchestrator-service-v2";
import { Utility } from "../../utility/utility";

export class workflowBase1 {

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

export class UtilityHandler extends workflowBase1 {

    constructor(workflowEvent: EventEmitter, orchestratorServiceInstance: IOrchestratorService_v2) {
        super(workflowEvent, orchestratorServiceInstance, "UTILITY_TASK_HANDLER");
    }

    async handleWorkflow(workflow: WorkflowConfig, task: TaskConfig, workflow_context: WorkflowContext): Promise<void> {
        console.log("Executing utility task", task.name);

        try {
            let inputParams = task.input_params;

            let messageInput: any = Utility.map_props(inputParams, workflow_context);
            if (messageInput == null) {
                const message = `Unresolved input parameter for task : ${task.name}`;
                console.error(message);
                WorkflowContext.failed(workflow_context, message);
                Task.fail(workflow_context.tasks[task.name], message);
                WorkflowContext.updateCurrentTask(workflow_context, workflow_context.tasks[task.name]);
                await this.saveWorkflowContext(workflow_context);
                return;
            }

            workflow_context.tasks[task.name] = Task.from({
                name: task.name,
                input: messageInput
            });
            Task.start(workflow_context.tasks[task.name]);
            WorkflowContext.updateCurrentTask(workflow_context, workflow_context.tasks[task.name]);

            //Save the workflow context
            await this.saveWorkflowContext(workflow_context);

            let output = await OrchestratorFunctions.invokeMethod(task.function!, messageInput);

            workflow_context.tasks[task.name].output = output;

            if (output.success) {
                Task.completed(workflow_context.tasks[task.name]);
                WorkflowContext.updateCurrentTask(workflow_context, workflow_context.tasks[task.name]);
            }
            else {
                WorkflowContext.failed(workflow_context, output.message);
                Task.fail(workflow_context.tasks[task.name], output.message);
                WorkflowContext.updateCurrentTask(workflow_context, workflow_context.tasks[task.name]);
            }
            //Save the workflow context
            await this.saveWorkflowContext(workflow_context);

            if (output.success) {
                await this.executeNextTask(workflow, task, workflow_context);
            }
            else {
                console.error(`Task failed for : ${task.name} , workflow : ${workflow.name}, execution_id : ${workflow_context.execution_id}`)
            }
        } catch (error) {
            const message = `Error while handling event task : ${task.name}`;
            console.error(message, error);
            WorkflowContext.failed(workflow_context, message);
            Task.fail(workflow_context.tasks[task.name], message);
            WorkflowContext.updateCurrentTask(workflow_context, workflow_context.tasks[task.name]);
            await this.saveWorkflowContext(workflow_context);
        }
    }

}

export class EventHandler extends workflowBase1 {

    constructor(workflowEvent: EventEmitter, orchestratorServiceInstance: IOrchestratorService_v2) {
        super(workflowEvent, orchestratorServiceInstance, "EVENT_TASK_HANDLER");
    }

    async handleWorkflow(workflow: WorkflowConfig, task: TaskConfig, workflow_context: WorkflowContext): Promise<void> {
        try {
            let inputParams = task.input_params;
            //Compose the input parameters
            let messageInput: any = Utility.map_props(inputParams, workflow_context);
            if (messageInput == null) {
                const message = `Unresolved input parameter for task : ${task.name}`;
                console.error(message);
                WorkflowContext.failed(workflow_context, message);
                Task.fail(workflow_context.tasks[task.name], message);
                WorkflowContext.updateCurrentTask(workflow_context, workflow_context.tasks[task.name]);
                await this.saveWorkflowContext(workflow_context);
                return;
            }

            workflow_context.tasks[task.name] = Task.from({
                name: task.name,
                input: messageInput
            });
            Task.start(workflow_context.tasks[task.name]);
            WorkflowContext.updateCurrentTask(workflow_context, workflow_context.tasks[task.name]);

            //Publish the message
            let queueMessage = QueueMessage.from({
                messageId: workflow_context.execution_id,
                messageType: `${workflow.name}|${task.task_reference_name}`, //Workflow name + task name
                data: messageInput
            });

            await this.publishMessage(task.topic as string, queueMessage);

            //Save the workflow context
            await this.saveWorkflowContext(workflow_context);
        } catch (error: any) {
            const message = `Error while handling event task : ${task.name}`;
            console.error(message, error);
            WorkflowContext.failed(workflow_context, message);
            Task.fail(workflow_context.tasks[task.name], message);
            WorkflowContext.updateCurrentTask(workflow_context, workflow_context.tasks[task.name]);
            await this.saveWorkflowContext(workflow_context);
        }
    }
}
