import _ from "lodash";

export class OrchestratorWorkflowConfig {

    constructor(config: Partial<OrchestratorWorkflowConfig>) {
        Object.assign(this, config);
        if (config.workflows)
            this.workflows = config.workflows.map((x: any) => new WorkflowConfig(x));
    }

    workflows: WorkflowConfig[] = [];
    subscriptions: Subscription[] = [];

    getWorkflowByName(name: string): WorkflowConfig | undefined {
        var wokflow = this.workflows.find(x => x.name == name);
        if (!wokflow) {
            console.error("getWorkflowByIdentifier : workflow not found ", name);
            return undefined;
        }
        return wokflow;
    }
}

export class WorkflowConfig {
    name!: string;
    description!: string;
    workflow_input!: any;
    tasks: TaskConfig[] = new Array<TaskConfig>();
    exception_task: TaskConfig[] = new Array<TaskConfig>();

    constructor(config: Partial<WorkflowConfig>) {
        Object.assign(this, config);
    }

    validateInput(input: any): boolean {
        let valid = true;
        let input_keys = Object.keys(input);
        Object.keys(this.workflow_input).forEach(key => {
            if (!input_keys.includes(key)) {
                console.error(`Unresolved input parameter for workflow : ${this.name}, param : ${key} `);
                valid = false;
            }
        });
        return valid;
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

