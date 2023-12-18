import { Topic } from "nodets-ms-core/lib/core/queue/topic";

export interface IWorkflowRegister {
    register(): void;
}

export class OrchestratorContext {
    //Topic instance store
    topics: Topic[] = [];

    constructor(config: Partial<OrchestratorContext>) {
        Object.assign(this, config);
    }

    workflows: Workflow[] = [];
    subscriptions: Subscription[] = [];

    getWorkflowByIdentifier(identifier: string): Workflow | undefined {
        var wokflow = this.workflows.find(x => x.worflow_identifier == identifier);
        if (!wokflow)
            console.error("getWorkflowByIdentifier : workflow not found ", identifier);

        return wokflow;
    }
}

export interface Workflow {
    worflow_group: string;
    worflow_type: string;
    worflow_identifier?: string;
    handlers?: Handler[];
}

export interface Handler {
    name: string;
    params: any;
    delegate_worflow?: string[];
}

export interface Subscription {
    description: string;
    topic: string;
    subscription: string;
}

