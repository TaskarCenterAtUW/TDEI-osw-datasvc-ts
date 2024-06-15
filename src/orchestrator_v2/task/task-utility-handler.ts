import EventEmitter from "events";
import _ from "lodash";
import { OrchestratorFunctions } from "./task-functions";
import { WorkflowConfig, TaskConfig } from "../workflow/workflow-config-model";
import { WorkflowContext, Task } from "../workflow/workflow-context.model";
import { IOrchestratorService_v2 } from "../orchestrator-service-v2";
import { OrchestratorUtility } from "../orchestrator-utility";
import { workflowBase_v2 } from "../workflow/workflow-base";

export class UtilityHandler extends workflowBase_v2 {

    constructor(workflowEvent: EventEmitter, orchestratorServiceInstance: IOrchestratorService_v2) {
        super(workflowEvent, orchestratorServiceInstance, "UTILITY_TASK_HANDLER");
    }

    async handleWorkflow(workflow: WorkflowConfig, task: TaskConfig, workflow_context: WorkflowContext): Promise<void> {
        console.log("Executing utility task", task.name);

        workflow_context.tasks[task.name] = Task.from({
            name: task.name,
            description: task.description
        });
        try {
            let inputParams = task.input_params;

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

            Task.start(workflow_context.tasks[task.name], messageInput);
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
                this.executeExceptionTasks(workflow, workflow_context);
            }
        } catch (error) {
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
