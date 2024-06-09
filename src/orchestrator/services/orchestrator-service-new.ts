import { Core } from "nodets-ms-core";
import { Topic } from "nodets-ms-core/lib/core/queue/topic";
import { QueueMessage } from "nodets-ms-core/lib/core/queue";
import { EventEmitter } from 'events';
import { OrchestratorConfigContextNew, Task, Workflow } from "../models/config-model-new";
import _ from 'lodash';
import { OrchestratorFunctions } from "./orchestrator-functions";


export class OrchestratorServiceNew {
    private topicCollection = new Map<string, Topic>();
    private orchestratorConfigContext: OrchestratorConfigContextNew = new OrchestratorConfigContextNew({});
    private workflowEvent = new EventEmitter();

    constructor(orchestratorConfig: any) {
        console.log("Initializing TDEI Orchestrator service");
        this.orchestratorConfigContext = new OrchestratorConfigContextNew(orchestratorConfig);
    }

    /**
     * Get workflow by identifier
     * @param name 
     * @returns 
     */
    getWorkflowByName(name: string): Workflow | undefined {
        return this.orchestratorConfigContext.getWorkflowByName(name);
    }

    /**
     * Initializes the orchestrator
     */
    initialize(workflows: any): void {
        this.initializeOrchestrator();
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
            var topic = this.getTopicInstance(subscription.topic as string);
            topic.subscribe(subscription.subscription as string,
                {
                    onReceive: this.handleMessage,
                    onError: this.handleFailedMessages
                });
        });
    }

    /**
     * Invokes the event
     * @param workflow 
     * @param message 
     */
    private async handleEventResponse(workflow: Workflow, task: Task, workflow_context: any, message: QueueMessage) {
        console.log("Received event response for task :", task.task_reference_name);

        //Extract the output parameters
        let outputParams = task.output_params;
        let messageData = message.data;
        let messageOutput: any = {};
        //Compose the output parameters
        Object.keys(outputParams).forEach((param: any) => {
            messageOutput[param] = _.get(messageData, outputParams[param]);
        });

        workflow_context[task.name].output = messageOutput;

        //get the next task in workflow
        await this.executeNextTask(workflow, task, workflow_context, message.messageId);
    }

    private async executeNextTask(workflow: Workflow, task: Task, workflow_context: any, messageId: string) {
        let nextTask = this.getNextTask(workflow, task);
        if (nextTask) {
            switch (nextTask.type) {
                case "Event":
                    //Compose input parameters
                    let inputParams = nextTask.input_params;
                    let messageOutput: any = {};
                    //Compose the input parameters
                    Object.keys(inputParams).forEach((param: any) => {
                        messageOutput[param] = _.get(workflow_context, inputParams[param]);
                        //TODO:Handle not resolved json paths
                    });
                    //Publish the message
                    let queueMessage = QueueMessage.from({
                        messageId: messageId,
                        messageType: nextTask.task_reference_name,
                        data: messageOutput
                    });
                    //TODO:Save the workflow context & stage
                    await this.publishMessage(nextTask.topic as string, queueMessage);
                    break;
                case "Utility":
                    //TODO:Invoke the utility function
                    await this.handleUtilityTask(workflow, nextTask, workflow_context, messageId);
                    //TODO:Save the workflow context & stage
                    break;
                default:
                    console.error("Invalid task type", nextTask.type);
                    break;
            }
        }
    }

    /**
     * Handle the utility task
     * @param workflow 
     * @param task 
     * @param workflow_context 
     * @param message 
     */
    private async handleUtilityTask(workflow: Workflow, task: Task, workflow_context: any, messageId: string) {

        console.log("Executing utility task", task.name);

        let inputParams = task.input_params;

        let messageOutput: any = {};

        Object.keys(inputParams).forEach((param: any) => {
            messageOutput[param] = _.get(workflow_context, inputParams[param]);

        });

        let output = await OrchestratorFunctions.invokeMethod(task.name, messageOutput);

        workflow_context[task.name].output = output;

        await this.executeNextTask(workflow, task, workflow_context, messageId);
    }

    /**
     * Get the next task in the workflow
     * @param workflow 
     * @param task 
     * @returns 
     */
    private getNextTask(workflow: Workflow, task: Task): Task | undefined {
        let nextTask = workflow.tasks.findIndex(x => x.task_reference_name == task.task_reference_name);
        if (workflow.tasks.length > nextTask + 1) {
            console.log("No more tasks in the workflow");
            return undefined;
        }
        return workflow.tasks[nextTask + 1];
    }

    /** 
     * Handle the subscribed messages
     * @param message 
     */
    private handleMessage = async (message: QueueMessage) => {
        try {
            console.log("Received message", message.messageType);
            //Get workflow identifier
            let messageType = message.messageType.split("|");
            let workflow_name = messageType[0];
            //Update the workflow history
            let workflow = this.orchestratorConfigContext.getWorkflowByName(workflow_name);
            if (workflow) {
                let task = workflow.tasks.find(x => x.task_reference_name == message.messageType);
                if (task) {
                    await this.handleEventResponse(workflow, task, {}, message);
                }
                else {
                    console.error("Task not found", message.messageType);
                }
            }

        } catch (error) {
            console.error("Error invoking handlers", error);
        }
        return Promise.resolve();
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
}
