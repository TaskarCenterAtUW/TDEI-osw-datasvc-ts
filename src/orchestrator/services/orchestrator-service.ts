import { Core } from "nodets-ms-core";
import { Topic } from "nodets-ms-core/lib/core/queue/topic";
import { QueueMessage } from "nodets-ms-core/lib/core/queue";
import { OrchestratorContext } from "../models/config-model";
import { EventEmitter } from 'events';
import workflowDatabaseService from "./workflow-database-service";

export interface IOrchestratorService {

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

    //Workflow configuration context
    orchestratorContext: OrchestratorContext;
}

export class OrchestratorService {
    private topicCollection = new Map<string, Topic>();
    orchestratorContext: OrchestratorContext = new OrchestratorContext({});

    constructor(orchestratorConfig: any, private readonly workflowEvent: EventEmitter) {
        console.log("Initializing TDEI Orchetrator service");
        this.orchestratorContext = new OrchestratorContext(orchestratorConfig);
        this.initializeOrchestrator();
        this.validateWorkflows();
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
        this.orchestratorContext.subscriptions.forEach(subscription => {
            var topic = Core.getTopic(subscription.topic as string);
            topic.subscribe(subscription.subscription as string,
                {
                    onReceive: this.handleMessage,
                    onError: this.handleFailedMessages
                });
            //Store the topics into collection 
            this.orchestratorContext.topics.push(topic);
        });
    }

    /**
     * Triggers the workflow of type "TRIGGER"
     * @param workflowIdentifier 
     * @param message 
     */
    async triggerWorkflow(workflowIdentifier: string, message: QueueMessage): Promise<void> {
        let trigger_workflow = this.orchestratorContext.getWorkflowByIdentifier(workflowIdentifier);
        if (trigger_workflow?.worflow_type == "TRIGGER") {
            //Log/Insert the workflow history
            // await workflowDatabaseService.logWorkflowHistory(
            //     trigger_workflow.workflow_group,
            //     trigger_workflow.worflow_stage,
            //     message);
            message.messageType = workflowIdentifier;
            //trigger workflow
            this.workflowEvent.emit(workflowIdentifier, message);
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
            let identifier = message.messageType;
            //Update the workflow history
            let trigger_workflow = this.orchestratorContext.getWorkflowByIdentifier(identifier);
            if (trigger_workflow) {
                workflowDatabaseService.updateWorkflowHistory(trigger_workflow?.worflow_stage!, message);
                //trigger workflow
                this.workflowEvent.emit(identifier, message);
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
        let identifier = message.messageType;

        //Find the workflow to trigger
        let trigger_workflow = this.orchestratorContext.getWorkflowByIdentifier(identifier);
        if (trigger_workflow?.worflow_type == "TRIGGER") {
            //Log/Insert the workflow history
            await workflowDatabaseService.logWorkflowHistory(
                trigger_workflow.workflow_group,
                trigger_workflow.worflow_stage,
                message);
        }
        //Trigger all workflow handlers
        trigger_workflow?.handlers?.forEach(handler => {
            //Dereference the message object
            let { ...def_message } = message;
            //Delegate handler
            try {
                this.workflowEvent.emit(handler.name, def_message, handler.delegate_worflow, handler.params);
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

                // let trigger_workflow = this.orchestratorContext.getWorkflowByIdentifier(workflow);
                // if (trigger_workflow?.worflow_type == "TRIGGER") {
                //     //Log/Insert the workflow history
                //     await workflowDatabaseService.logWorkflowHistory(
                //         trigger_workflow.workflow_group,
                //         trigger_workflow.worflow_stage,
                //         message);
                // }
                //trigger workflow
                console.log("delegateWorkflowIfAny :", workflow)
                this.workflowEvent.emit(workflow, message);
            });
        }
    }

    /**
     * Publishes the message to the specified topic
     * @param topic 
     * @param message 
     */
    publishMessage = async (topic: string, message: QueueMessage): Promise<void> => {
        let topicInstance = this.getTopicInstance(topic);
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
        const duplicateWorkflowIdentifiers = this.orchestratorContext.workflows
            .map((el, i) => {
                return this.orchestratorContext.workflows.find((element, index) => {
                    if (i !== index && element.worflow_identifier === el.worflow_identifier) {
                        return el
                    }
                })
            })
            .filter(Boolean);

        if (duplicateWorkflowIdentifiers.length)
            console.log("Duplicate Workflow Identifiers, please avoid duplicate workflow identifiers:", duplicateWorkflowIdentifiers)

        //2. Validate the duplicate subscriptions
        const duplicateSubscriptions = this.orchestratorContext.subscriptions
            .map((el, i) => {
                return this.orchestratorContext.subscriptions.find((element, index) => {
                    if (i !== index && element.topic === el.topic && element.subscription === el.subscription) {
                        return el
                    }
                })
            })
            .filter(x => x?.subscription);

        if (duplicateSubscriptions.length)
            console.log("Duplicate Subscriptions found, please avoid duplicate subscriptions:", duplicateSubscriptions)

        //3. Validate deligate workflow exists
        const workflowsWithDelegateNotExists = this.orchestratorContext.workflows
            .map(workflow =>
                workflow.handlers?.some(handler =>
                    handler.delegate_worflow?.some(delegate =>
                        !this.orchestratorContext.workflows.find(x => x.worflow_identifier === delegate)
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
        let listOfWorkflowsConfigured = this.orchestratorContext.workflows.map(x => x.worflow_identifier);

        let wokflowNotRegistered = listOfWorkflowsConfigured.filter(wh => !this.workflowEvent.eventNames().find(x => x === wh));

        if (wokflowNotRegistered.length) {
            console.log("Below workflows are configured but not registered", wokflowNotRegistered);
        }

        const listOfHandlersConfigured = Array.from(
            new Set(
                this.orchestratorContext.workflows
                    .flatMap(workflow => workflow.handlers?.map(handler => handler.name) || [])
                    .filter(Boolean)
            )
        );

        let handlersNotRegistered = listOfHandlersConfigured.filter(wh => !this.workflowEvent.eventNames().find(x => x === wh));
        if (handlersNotRegistered.length) {
            console.log("Below handlers are configured but not registered", handlersNotRegistered);
        }

        if (wokflowNotRegistered.length || handlersNotRegistered.length) {
            throw Error("Error in workflow configuration");
        }
    }
}
