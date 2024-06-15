import EventEmitter from "events";
import _ from "lodash";
import { WorkflowConfig, TaskConfig } from "../workflow/workflow-config-model";
import { WorkflowContext, Task } from "../workflow/workflow-context.model";
import { QueueMessage } from "nodets-ms-core/lib/core/queue";
import { IOrchestratorService_v2 } from "../orchestrator-service-v2";
import { OrchestratorUtility } from "../orchestrator-utility";
import { workflowBase_v2 } from "../workflow/workflow-base";

export class EventHandler extends workflowBase_v2 {

    constructor(workflowEvent: EventEmitter, orchestratorServiceInstance: IOrchestratorService_v2) {
        super(workflowEvent, orchestratorServiceInstance, "EVENT_TASK_HANDLER");
    }

    async handleWorkflow(workflow: WorkflowConfig, task: TaskConfig, workflow_context: WorkflowContext): Promise<void> {
        try {
            workflow_context.tasks[task.name] = Task.from({
                name: task.name
            });

            let inputParams = task.input_params;
            //Compose the input parameters
            let messageInput: any = OrchestratorUtility.map_props(inputParams, workflow_context);
            if (messageInput == null) {
                const message = `Unresolved input parameter for task : ${task.name}`;
                console.error(message);
                WorkflowContext.failed(workflow_context, message);
                Task.fail(workflow_context.tasks[task.name], message);
                WorkflowContext.updateCurrentTask(workflow_context, workflow_context.tasks[task.name]);
                await this.saveWorkflowContext(workflow_context);
                return;
            }

            //Remove empty properties from the event input
            messageInput = _.pickBy(messageInput, _.identity);
            //Remove empty arrays items for event input
            messageInput = _.mapValues(messageInput, (value: any) => {
                if (_.isArray(value)) {
                    return _.compact(value);
                }
                return value;
            });


            Task.start(workflow_context.tasks[task.name], messageInput);
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
            this.executeExceptionTasks(workflow, workflow_context);
        }
    }
}
