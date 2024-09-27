import { QueueMessage } from "nodets-ms-core/lib/core/queue";
import { IOrchestratorService_v2 } from "./orchestrator-service-v2";
import { WorkflowConfig, TaskConfig } from "./workflow/workflow-config-model";
import { WorkflowContext } from "./workflow/workflow-context.model";


export class DummyOrchestrator_v2 implements IOrchestratorService_v2 {
    startWorkflow(job_id: string, workflowName: string, workflow_input: any, user_id: string): Promise<void> {
        console.log("DummyOrchestrator_v2: startWorkflow");
        console.log("job_id: ", job_id);
        console.log("workflowName: ", workflowName);
        console.log("workflow_input: ", workflow_input);
        console.log("user_id: ", user_id);
        return Promise.resolve();
    }
    executeNextTask(workflow: WorkflowConfig, task: TaskConfig, workflow_context: any): Promise<void> {
        console.log("DummyOrchestrator_v2: executeNextTask");
        console.log("workflow: ", workflow);
        console.log("task: ", task);
        console.log("workflow_context: ", workflow_context);

        return Promise.resolve();
    }
    publishMessage(topic: string, message: QueueMessage): Promise<void> {
        console.log("DummyOrchestrator_v2: publishMessage");
        console.log("topic: ", topic);
        console.log("message: ", message);
        return Promise.resolve();
    }
    executeExceptionTasks(workflow: WorkflowConfig, workflow_context: WorkflowContext): Promise<void> {
        console.log("DummyOrchestrator_v2: executeExceptionTasks");
        console.log("workflow: ", workflow);
        console.log("workflow_context: ", workflow_context);
        return Promise.resolve();
    }
    executeNextExceptionTask(workflow: WorkflowConfig, task: TaskConfig, workflow_context: WorkflowContext): Promise<void> {
        console.log("DummyOrchestrator_v2: executeNextExceptionTask");
        console.log("workflow: ", workflow);
        console.log("task: ", task);
        console.log("workflow_context: ", workflow_context);
        return Promise.resolve();
    }

}