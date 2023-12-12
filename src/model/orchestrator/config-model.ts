

export class Tasks {
    tasks: Task[] = [];
    getTaskByName(taskName: string) {
        let task = this.tasks.find(x => x.task == taskName);
        if (!task) {
            console.error(`Task not found  : ${taskName}`);
            return null;
        }
        return task;
    }
}

export class Task {
    task: string = "";
    workflows: Workflow[] = [];

    getWorkflowByMessageType(messageType: string) {
        let workflow: Workflow = this.workflows.find(x => x.message_type == messageType)!;
        if (!workflow) {
            console.error(`Workflow not found for message type : ${messageType}`);
            return null;
        }
        return workflow;
    }
}

export class Workflow {
    event: string = "";
    action: string = "";
    message_type?: string = "";
    topic?: string = "";
    subscription?: string = "";
    next_event?: string = "";
}
