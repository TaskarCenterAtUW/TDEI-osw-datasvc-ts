import { Core } from "nodets-ms-core";
import { Topic } from "nodets-ms-core/lib/core/queue/topic";
import { QueueMessage } from "nodets-ms-core/lib/core/queue";
import { OrchestratorContext } from "../models/config-model";
import { EventEmitter } from 'events';

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
    delegateWorkflowIfAny(delegateWorkflows: string[], message: QueueMessage, params: any): void;
}

export class OrchestratorService {
    private topicCollection = new Map<string, Topic>();
    orchestratorContext: OrchestratorContext = new OrchestratorContext({});

    constructor(orchestratorConfig: any, private readonly emitter: EventEmitter) {
        console.log("Initializing TDEI Orchetrator service");
        this.orchestratorContext = new OrchestratorContext(orchestratorConfig);
        this.initializeOrhchestrator();
        this.validateWorkflows();
    }

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
    private initializeOrhchestrator() {
        //TODO:: Validate workflows, 
        //1. Check unique workflow identifiers
        //2. Check delegate_worflow identifier exists
        //3. Handle message processing promise
        //this.subscribe();
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
                    onReceive: this.delegateWorkflow,
                    onError: this.handleFailedMessages
                });
            //Store the topics into collection 
            this.orchestratorContext.topics.push(topic);
        });
    }

    /** 
     * Handle the subscribed messages
     * @param message 
     */
    private delegateWorkflow = (message: QueueMessage) => {
        try {
            console.log("Received message", message.messageType);
            //Get workflow identifier
            let identifier = message.messageType;
            //trigger workflow
            this.emitter.emit(identifier, message);
        } catch (error) {
            console.error("Error invoking handlers", error);
        }
        return Promise.resolve();
    }

    /**
     * Delegates workflow handlers
     * @param message 
     */
    delegateWorkflowHandlers = (message: QueueMessage): void => {
        let identifier = message.messageType;

        //Find the workflow to trigger
        let trigger_workflow = this.orchestratorContext.getWorkflowByIdentifier(identifier);
        //Trigger all workflow handlers
        trigger_workflow?.handlers?.forEach(handler => {
            //Dereference the message object
            let { ...def_message } = message;
            //Delegate handler
            try {
                this.emitter.emit(handler.name, def_message, handler.delegate_worflow, handler.params);
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
    delegateWorkflowIfAny = (delegateWorkflows: string[], message: QueueMessage, params: any): void => {
        if (delegateWorkflows) {
            delegateWorkflows.forEach(workflow => {
                message.messageType = workflow;
                this.emitter.emit(workflow, message, params);
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

    private handleFailedMessages(error: Error) {
        console.log('Error handling the message');
        console.log(error);
    }

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
        // this.orchestratorContext.workflows.forEach( x => x.handlers?.forEach( ))

    }
}
