
export class OrchestratorConfigContext {

    constructor(config: Partial<OrchestratorConfigContext>) {
        Object.assign(this, config);
    }

    workflows: Workflow[] = [];
    subscriptions: Subscription[] = [];

    getWorkflowByIdentifier(identifier: string): Workflow | undefined {
        var wokflow = this.workflows.find(x => x.identifier == identifier);
        if (!wokflow)
            console.error("getWorkflowByIdentifier : workflow not found ", identifier);

        return wokflow;
    }
}

export const GENERIC_WORKFLOW_IDENTIFIER = "GENERIC_WORKFLOW_IDENTIFIER";

export interface Workflow {
    group: string;
    stage: string;
    type: string;
    identifier?: string;
    generic_workflow?: boolean;
    next_steps?: WorkflowSteps[];
}

export interface WorkflowSteps {
    process_identifier: string;
    params: any;
    delegate_worflow?: string[];
}

export interface Subscription {
    description: string;
    topic: string;
    subscription: string;
}

