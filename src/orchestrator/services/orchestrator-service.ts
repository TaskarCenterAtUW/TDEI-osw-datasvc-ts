import { Core } from "nodets-ms-core";
import { Topic } from "nodets-ms-core/lib/core/queue/topic";
import { QueueMessage } from "nodets-ms-core/lib/core/queue";
import { GENERIC_WORKFLOW_IDENTIFIER, OrchestratorConfigContext, Workflow } from "../models/config-model";
import { EventEmitter } from 'events';
import workflowDatabaseService from "./workflow-database-service";

export interface IOrchestratorService {
    /**
     * Initializes the orchestrator
     */
    initialize(workflows: any): void;

    /**
     * Publishes the message to the specified topic
     * @param topic 
     * @param message 
     */
    publishMessage(topic: string, message: QueueMessage): Promise<void>;

    /**
         * Delegates workflow handlers
         * @param message 
         */
    delegateWorkflowHandlers(message: QueueMessage): void;

    /**
     * Delegate the workflow
     * @param delegateWorkflows 
     * @param message 
     * @param params 
     */
    delegateWorkflowIfAny(delegateWorkflows: string[], message: QueueMessage): void;

    /**
     * Validate declared vs registered workflow & handlers
     */
    validateDeclaredVsRegisteredWorkflowHandlers(): void;

    /**
     * Triggers the workflow of type "TRIGGER"
     * @param workflowIdentifier 
     * @param message 
     */
    triggerWorkflow(workflowIdentifier: string, message: QueueMessage): Promise<void>;

    /**
     * Get workflow by identifier
     * @param identifier 
     * @returns 
     */
    getWorkflowByIdentifier(identifier: string): Workflow | undefined;
}

export class OrchestratorService {
    private topicCollection = new Map<string, Topic>();
    private orchestratorConfigContext: OrchestratorConfigContext = new OrchestratorConfigContext({});
    private workflowEvent = new EventEmitter();

    constructor(orchestratorConfig: any) {
        console.log("Initializing TDEI Orchestrator service");
        this.orchestratorConfigContext = new OrchestratorConfigContext(orchestratorConfig);
    }

    /**
     * Get workflow by identifier
     * @param identifier 
     * @returns 
     */
    getWorkflowByIdentifier(identifier: string): Workflow | undefined {
        return this.orchestratorConfigContext.getWorkflowByIdentifier(identifier);
    }

    /**
     * Initializes the orchestrator
     */
    initialize(workflows: any): void {
        this.registerWorkflows(workflows);
        this.initializeOrchestrator();
        this.validateWorkflows();
        //Validate the workflow and handlers defined in configuration are registered in the Orchestrator engine
        this.validateDeclaredVsRegisteredWorkflowHandlers();
    }

    /**
     * Registers the workflows
     * @param workflows 
     */
    registerWorkflows(workflows: any): void {
        //Register all handlers and workflow
        console.log("Registering the orchestration workflow and handlers");
        const uniqueArray = [...new Set(workflows)];
        uniqueArray.forEach((x: any) => {
            new x(this.workflowEvent, this);
        });
    }

    /**
     * Method to to get the topic instance by name
     * @param topicName 
     * @returns 
     */
    private getTopicInstance(topicName: string) {
        let topic = this.topicCollection.get(topicName);
        if (!topic) {
            topic = Core.getTopic(topicName);
            this.topicCollection.set(topicName, topic);
        }
        return topic;
    }

    /**
     * Initializes the workflows
     */
    private initializeOrchestrator() {
        this.subscribe();
    }

    /**
     * Subscribe all
     */
    private subscribe() {
        console.log("Subscribing TDEI orchestrator subscriptions");
        this.orchestratorConfigContext.subscriptions.forEach(subscription => {
            const topic = this.getTopicInstance(subscription.topic as string);
            topic.subscribe(subscription.subscription as string,
                {
                    onReceive: this.handleMessage,
                    onError: this.handleFailedMessages
                });
        });
    }

    /**
     * Triggers the workflow of type "TRIGGER"
     * @param workflowIdentifier 
     * @param message 
     */
    async triggerWorkflow(workflowIdentifier: string, message: QueueMessage): Promise<void> {
        const trigger_workflow = this.orchestratorConfigContext.getWorkflowByIdentifier(workflowIdentifier);
        if (trigger_workflow?.type == "TRIGGER") {

            message.messageType = workflowIdentifier;
            if (trigger_workflow?.generic_workflow) {
                //trigger generic workflow
                this.workflowEvent.emit(GENERIC_WORKFLOW_IDENTIFIER, message);
            }
            else {
                //trigger workflow
                this.workflowEvent.emit(workflowIdentifier, message);
            }
        }
        else {
            return Promise.reject("Workflow with type 'Trigger' only allowed. Workflow with type HANDLER cannot be triggered");
        }
        return Promise.resolve();
    }

    /** 
     * Handle the subscribed messages
     * @param message 
     */
    private handleMessage = (message: QueueMessage) => {
        try {
            console.log("Received message", message.messageType);
            //Get workflow identifier
            const identifier = message.messageType;
            //Update the workflow history
            const trigger_workflow = this.orchestratorConfigContext.getWorkflowByIdentifier(identifier);
            if (trigger_workflow) {
                workflowDatabaseService.updateWorkflowHistory(trigger_workflow?.stage ?? "", message);

                if (trigger_workflow.generic_workflow) {
                    //trigger generic workflow
                    this.workflowEvent.emit(GENERIC_WORKFLOW_IDENTIFIER, message);
                }
                else {
                    //trigger workflow
                    this.workflowEvent.emit(identifier, message, trigger_workflow.next_steps, null);
                }
            }
        } catch (error) {
            console.error("Error invoking handlers", error);
        }
        return Promise.resolve();
    }

    /**
     * Delegates workflow handlers
     * @param message 
     */
    delegateWorkflowHandlers = async (message: QueueMessage): Promise<void> => {
        const identifier = message.messageType;

        //Find the workflow to trigger
        const trigger_workflow = this.orchestratorConfigContext.getWorkflowByIdentifier(identifier);
        if (trigger_workflow?.type == "TRIGGER") {
            //Log/Insert the workflow history
            await workflowDatabaseService.logWorkflowHistory(
                trigger_workflow.group,
                trigger_workflow.stage,
                message);
        }
        //Trigger all workflow handlers
        trigger_workflow?.next_steps?.forEach(handler => {
            //Dereference the message object
            const { ...def_message } = message;
            //Delegate handler
            try {
                this.workflowEvent.emit(handler.process_identifier, def_message, handler.delegate_worflow, handler.params);
            } catch (error) {
                console.error("Error invoking handlers", error);
            }
        });
    }

    /**
     * Delegate the workflow
     * @param delegateWorkflows 
     * @param message 
     * @param params 
     */
    delegateWorkflowIfAny = (delegateWorkflows: string[], message: QueueMessage): void => {
        if (delegateWorkflows) {
            delegateWorkflows.forEach(async workflow => {
                message.messageType = workflow;
                //trigger workflow
                console.log("delegateWorkflowIfAny :", workflow);

                const trigger_workflow = this.orchestratorConfigContext.getWorkflowByIdentifier(workflow);
                if (trigger_workflow?.generic_workflow) {
                    //trigger generic workflow
                    this.workflowEvent.emit(GENERIC_WORKFLOW_IDENTIFIER, message);
                }
                else {
                    //trigger workflow
                    this.workflowEvent.emit(workflow, message);
                }
            });
        }
    }

    /**
     * Publishes the message to the specified topic
     * @param topic 
     * @param message 
     */
    publishMessage = async (topic: string, message: QueueMessage): Promise<void> => {
        const topicInstance = this.getTopicInstance(topic);
        await topicInstance.publish(message);
    }

    /**
     * Handles the failure message handling
     * @param error 
     */
    private handleFailedMessages(error: Error) {
        console.log('Error handling the message');
        console.log(error);
    }

    /**
     * Validates the workflow configuration
     */
    validateWorkflows() {
        //1. Validate the duplicate workflow identifier
        const duplicateWorkflowIdentifiers = this.orchestratorConfigContext.workflows
            .map((el, i) => {
                return this.orchestratorConfigContext.workflows.find((element, index) => {
                    if (i !== index && element.identifier === el.identifier) {
                        return el
                    }
                })
            })
            .filter(Boolean);

        if (duplicateWorkflowIdentifiers.length)
            console.log("Duplicate Workflow Identifiers, please avoid duplicate workflow identifiers:", duplicateWorkflowIdentifiers)

        //2. Validate the duplicate subscriptions
        const duplicateSubscriptions = this.orchestratorConfigContext.subscriptions
            .map((el, i) => {
                return this.orchestratorConfigContext.subscriptions.find((element, index) => {
                    if (i !== index && element.topic === el.topic && element.subscription === el.subscription) {
                        return el
                    }
                })
            })
            .filter(x => x?.subscription);

        if (duplicateSubscriptions.length)
            console.log("Duplicate Subscriptions found, please avoid duplicate subscriptions:", duplicateSubscriptions)

        //3. Validate delegate workflow exists
        const workflowsWithDelegateNotExists = this.orchestratorConfigContext.workflows
            .map(workflow =>
                workflow.next_steps?.some(handler =>
                    handler.delegate_worflow?.some(delegate =>
                        !this.orchestratorConfigContext.workflows.find(x => x.identifier === delegate)
                    )
                )
                    ? workflow
                    : null
            )
            .filter(Boolean);

        //TODO:: 4. Validate the delegate workflow belongs to the same workflow type group

        if (workflowsWithDelegateNotExists.length)
            console.log("Delegate workflow does not exists for below workflows:", workflowsWithDelegateNotExists)

        if (workflowsWithDelegateNotExists.length
            || duplicateSubscriptions.length
            || duplicateWorkflowIdentifiers.length)
            throw new Error("Error in workflow configuration");
    }

    /**
     * Validate declared vs registered workflow & handlers
     */
    validateDeclaredVsRegisteredWorkflowHandlers(): void {
        const listOfWorkflowsConfigured = this.orchestratorConfigContext.workflows.filter(f => !f.generic_workflow).map(x => x.identifier);

        const wokflowNotRegistered = listOfWorkflowsConfigured.filter(wh => !this.workflowEvent.eventNames().find(x => x === wh));

        if (wokflowNotRegistered.length) {
            console.log("Below workflows are configured but not registered", wokflowNotRegistered);
        }

        const listOfHandlersConfigured = Array.from(
            new Set(
                this.orchestratorConfigContext.workflows
                    .flatMap(workflow => workflow.next_steps?.map(handler => handler.process_identifier) || [])
                    .filter(Boolean)
            )
        );

        const handlersNotRegistered = listOfHandlersConfigured.filter(wh => !this.workflowEvent.eventNames().find(x => x === wh));
        if (handlersNotRegistered.length) {
            console.log("Below handlers are configured but not registered", handlersNotRegistered);
        }

        if (wokflowNotRegistered.length || handlersNotRegistered.length) {
            throw Error("Error in workflow configuration");
        }
    }
}
