import EventEmitter from "events";
import _ from "lodash";
import { OrchestratorFunctions } from "./task-functions";
import { WorkflowConfig, TaskConfig } from "../workflow/workflow-config-model";
import { WorkflowContext, Task, WorkflowStatus } from "../workflow/workflow-context.model";
import { IOrchestratorService_v2 } from "../orchestrator-service-v2";
import { OrchestratorUtility } from "../orchestrator-utility";
import { workflowBase_v2 } from "../workflow/workflow-base";

export class TaskExceptionHandler extends workflowBase_v2 {

    constructor(workflowEvent: EventEmitter, orchestratorServiceInstance: IOrchestratorService_v2) {
        super(workflowEvent, orchestratorServiceInstance, "EXCEPTION_TASK_HANDLER");
    }

    async handleWorkflow(workflow: WorkflowConfig, task: TaskConfig, workflow_context: WorkflowContext): Promise<void> {
        console.log(`Executing exception, workflow : ${workflow.name}, task : ${task.name}, execution_id : ${workflow_context.execution_id}`);

        try {
            workflow_context.exception_task[task.name] = Task.from({
                name: task.name,
                description: task.description
            });

            let inputParams = task.input_params;
            console.log(workflow_context);
            let messageInput: any = OrchestratorUtility.map_props(inputParams, workflow_context);
            if (messageInput == null) {
                const message = `Unresolved input parameter for task : ${task.name}`;
                console.error(message);
                Task.fail(workflow_context.exception_task[task.name], message);
                await this.saveWorkflowContext(workflow_context);
                return;
            }
            // Workaround for abandonned flows
            if(workflow_context.status === WorkflowStatus.ABANDONED) {
                messageInput['data']['status'] = WorkflowStatus.ABANDONED;
                messageInput['data']['message'] = workflow_context.current_task_error;
            }
            Task.start(workflow_context.exception_task[task.name], messageInput);

            //Save the workflow context
            await this.saveWorkflowContext(workflow_context);

            let output = await OrchestratorFunctions.invokeMethod(task.function!, messageInput);

            workflow_context.exception_task[task.name].output = output;

            if (output.success) {
                Task.completed(workflow_context.exception_task[task.name]);
            }
            else {
                Task.fail(workflow_context.exception_task[task.name], output.message);
            }
            //Save the workflow context
            await this.saveWorkflowContext(workflow_context);

            if (output.success) {
                await this.executeNextExceptionTask(workflow, task, workflow_context);
            }

        } catch (error) {
            const message = `Error while handling exception task : ${task.name}`;
            console.error(message, error);
            Task.fail(workflow_context.exception_task[task.name], message);
            await this.saveWorkflowContext(workflow_context);
        }
    }

} 
