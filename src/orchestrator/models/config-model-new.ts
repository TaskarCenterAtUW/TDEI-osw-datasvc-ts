
export class OrchestratorConfigContextNew {

    constructor(config: Partial<OrchestratorConfigContextNew>) {
        Object.assign(this, config);
    }

    workflows: Workflow[] = [];
    subscriptions: Subscription[] = [];

    getWorkflowByName(name: string): Workflow | undefined {
        var wokflow = this.workflows.find(x => x.name == name);
        if (!wokflow)
            console.error("getWorkflowByIdentifier : workflow not found ", name);

        return wokflow;
    }
}

export interface Workflow {
    name: string;
    description: string;
    workflow_input: any;
    tasks: Task[]
}

export interface Task {
    name: string
    task_reference_name: string
    description: string
    type: string
    topic?: string
    input_params: any;
    output_params: any;
    function?: string
}

export interface Subscription {
    description: string;
    topic: string;
    subscription: string;
}

