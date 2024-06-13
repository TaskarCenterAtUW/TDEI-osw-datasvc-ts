import _ from "lodash";

export class OrchestratorWorkflowConfig {

    constructor(config: Partial<OrchestratorWorkflowConfig>) {
        Object.assign(this, config);
    }

    workflows: WorkflowConfig[] = [];
    subscriptions: Subscription[] = [];

    getWorkflowByName(name: string): WorkflowConfig | undefined {
        var wokflow = this.workflows.find(x => x.name == name);
        if (!wokflow)
            console.error("getWorkflowByIdentifier : workflow not found ", name);

        return wokflow;
    }
}

export class WorkflowConfig {
    name!: string;
    description!: string;
    workflow_input!: any;
    tasks: TaskConfig[] = new Array<TaskConfig>();

    validateInput(input: any): boolean {
        Object.keys(this.workflow_input).forEach(key => {
            this.workflow_input[key] = _.get(input, this.workflow_input[key], null);
            if (this.workflow_input[key] == null) {
                console.error(`Unresolved input parameter for workflow : ${this.name}, param : ${key} `);
                return false;
            }
        });
        return true;
    }
}

export interface TaskConfig {
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

