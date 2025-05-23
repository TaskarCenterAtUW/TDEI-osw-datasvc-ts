import { Core } from "nodets-ms-core";
import { Topic } from "nodets-ms-core/lib/core/queue/topic";
import { QueueMessage } from "nodets-ms-core/lib/core/queue";
import { EventEmitter } from 'events';
import { OrchestratorWorkflowConfig, TaskConfig, WorkflowConfig } from "./workflow/workflow-config-model";
import _ from 'lodash';
import { Task, WorkflowContext, WorkflowStatus } from "./workflow/workflow-context.model";
import { WorkflowDetailsEntity } from "../database/entity/workflow-details-entity";
import { OrchestratorUtility } from "./orchestrator-utility";

export interface IOrchestratorService_v2 {
    startWorkflow(job_id: string, workflowName: string, workflow_input: any, user_id: string): Promise<void>;
    executeNextTask(workflow: WorkflowConfig, task: TaskConfig, workflow_context: any): Promise<void>;
    publishMessage(topic: string, message: QueueMessage): Promise<void>;
    executeExceptionTasks(workflow: WorkflowConfig, workflow_context: WorkflowContext): Promise<void>;
    executeNextExceptionTask(workflow: WorkflowConfig, task: TaskConfig, workflow_context: WorkflowContext): Promise<void>;
}

export class OrchestratorService_v2 implements IOrchestratorService_v2 {
    private topicCollection = new Map<string, Topic>();
    private orchestratorConfigContext: OrchestratorWorkflowConfig = new OrchestratorWorkflowConfig({});
    private workflowEvent = new EventEmitter();
    private default_request_handler_subscription = "request-handler"; // Default subscription for all request handlers

    constructor(orchestratorConfig: any, workflows: any) {
        console.log("Initializing TDEI Orchestrator service v2");
        this.orchestratorConfigContext = new OrchestratorWorkflowConfig(orchestratorConfig);
        this.initialize(workflows);
    }

    /**
     * Get workflow by identifier
     * @param name 
     * @returns 
     */
    getWorkflowByName(name: string): WorkflowConfig | undefined {
        return this.orchestratorConfigContext.getWorkflowByName(name);
    }

    /**
     * Initializes the orchestrator
     */
    initialize(workflows: any): void {
        this.registerWorkflows(workflows);
        this.initializeOrchestrator();
    }

    /**
     * Registers the workflows
     * @param workflows 
     */
    registerWorkflows(workflows: any): void {
        //Register all handlers and workflow
        console.log("Registering the orchestration v2 workflow handlers");
        const uniqueArray = [...new Set(workflows)];
        uniqueArray.forEach((x: any) => {
            let handler = new x(this.workflowEvent, this);
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
        let duplicateResult = this.verifyWorkflowTaskUnique(this.orchestratorConfigContext.workflows);
        if (duplicateResult.length > 0) {
            let error = duplicateResult.map((x: any) => x.workflow + " : " + x.task).join(",");
            console.error("Workflow task names are not unique");
            throw new Error("Workflow task names are not unique :" + error);
        }
        else {
            this.subscribe();
            // Also subscribe for DLQ
            this.subscribeToDLQ();
        }
    }

    /**
     * Verify the workflow task names are unique
     * @param workflow 
     * @returns 
     */
    private verifyWorkflowTaskUnique(workflow: WorkflowConfig[]) {
        let duplicates: any = [];
        workflow.forEach(workflow => {
            let taskNames: string[] = [];
            workflow.tasks.forEach(task => {
                taskNames.push(task.task_reference_name);
            });

            let uniqueTaskNames = _.uniq(taskNames);
            if (taskNames.length !== uniqueTaskNames.length) {
                uniqueTaskNames.forEach(uniqueName => {
                    let count = taskNames.filter(name => name === uniqueName).length;
                    if (count > 1) {
                        duplicates.push({ workflow: workflow.name, task: uniqueName });
                    }
                });
            }
        });

        return duplicates;
    }

    /**
     * Subscribe all
     */
    private subscribe() {
        console.log("Subscribing TDEI orchestrator v2 subscriptions");
        this.orchestratorConfigContext.subscriptions.forEach(subscription => {
            var topic = this.getTopicInstance(subscription.topic as string);
            topic.subscribe(subscription.subscription as string,
                {
                    onReceive: this.handleMessage,
                    onError: this.handleFailedMessages
                });
        });
    }

    private subscribeToDLQ() {
        console.log("Subscribing TDEI orchestrator v2 DLQ subscriptions");
        const all_request_topics : string[] = []
        // Get all the topics in the workflows
        this.orchestratorConfigContext.workflows.forEach(workflow => {
            workflow.tasks.forEach(task => {
                if (task.type === "Event") {
                  const topic_name = task.topic;
                  if (topic_name) {
                    all_request_topics.push(topic_name);
                  }
                }
            });
            
        });
        // Make only unique topics
        const unique_request_topics = [...new Set(all_request_topics)];
        // Subscribe the the deadletterqueue for all the topics
        unique_request_topics.forEach(topic_name => {
        var topic = this.getTopicInstance(topic_name); // Not sure whether it should be used
        const default_dlq_subscription = this.default_request_handler_subscription + "/$deadletterqueue"; // This is important. If we remove the suffix, the orchestrator will not work
        topic.subscribe(default_dlq_subscription,
            {
                onReceive: this.handleDLQMessage,
                onError: this.handleFailedMessages
            });
        });
    }

    /**
     * Start the workflow
     * @param workflowName 
     * @param workflow_input 
     */
    public async startWorkflow(job_id: string, workflowName: string, workflow_input: any, user_id: string) {

        //New workflow
        let workflowConfig = this.orchestratorConfigContext.getWorkflowByName(workflowName);
        if (!workflowConfig) {
            console.error("Workflow not found", workflowName);
            throw new Error("Workflow not found");
        }
        if (!workflowConfig.validateInput(workflow_input)) {
            console.error("Invalid/Missing input for workflow", workflowName);
            throw new Error("Invalid/Missing input for workflow");
        }
        let workflowContext = WorkflowContext.from({
            workflow_input: workflow_input,
            total_workflow_tasks: workflowConfig.tasks.length
        });
        WorkflowContext.start(workflowContext);
        let workflow_db_details = WorkflowDetailsEntity.from({
            job_id: job_id,
            workflow_name: workflowName,
            workflow_context: workflowContext,
            status: WorkflowStatus.RUNNING,
            triggered_by: user_id
        });
        //Save the workflow
        await WorkflowDetailsEntity.saveWorkflow(workflow_db_details);
        workflowContext.execution_id = workflow_db_details.execution_id;
        await this.executeTask(workflowConfig, workflowConfig.tasks[0], workflowContext);
    }

    /**
     * Invokes the event
     * @param workflow 
     * @param message 
     */
    private async handleEventResponse(workflow: WorkflowConfig, task: TaskConfig, workflow_context: WorkflowContext, message: QueueMessage) {
        console.log(`Received event response for workflow : ${workflow.name}, task : ${task.name}, execution_id : ${workflow_context.execution_id}`);

        try {
            //Extract the output parameters
            let outputParams = task.output_params;

            let messageOutput: any = OrchestratorUtility.map_props(outputParams, message);
            if (messageOutput == null) {
                const message = `Unresolved input parameter for task : ${task.name}`;
                console.error(message);
                WorkflowContext.failed(workflow_context, message);
                Task.fail(workflow_context.tasks[task.name], message);
                WorkflowContext.updateCurrentTask(workflow_context, workflow_context.tasks[task.name]);
                await WorkflowDetailsEntity.saveWorkflowContext(workflow_context.execution_id, workflow_context);
                return;
            }

            workflow_context.tasks[task.name].output = messageOutput;

            if (messageOutput.success != null && messageOutput.success) {
                Task.completed(workflow_context.tasks[task.name]);
                WorkflowContext.updateCurrentTask(workflow_context, workflow_context.tasks[task.name]);
            }
            else {
                // abandoned use case to be written here.
                if (messageOutput.abandoned != null && messageOutput.abandoned) {
                    // abandoned message received
                    WorkflowContext.abandon(workflow_context, messageOutput.message);
                    Task.abandon(workflow_context.tasks[task.name], messageOutput.message);
                }
                else {
                    WorkflowContext.failed(workflow_context, messageOutput.message);
                    Task.fail(workflow_context.tasks[task.name], messageOutput.message);
                }
                WorkflowContext.updateCurrentTask(workflow_context, workflow_context.tasks[task.name]);
            }
            //Save the workflow context
            await WorkflowDetailsEntity.saveWorkflowContext(workflow_context.execution_id, workflow_context);

            if (messageOutput.success) {
                await this.executeNextTask(workflow, task, workflow_context);
            }
            else {
                console.error(`Task failed for : ${task.name} , workflow : ${workflow.name}, execution_id : ${workflow_context.execution_id}`)
                await this.executeExceptionTasks(workflow, workflow_context);
            }
        } catch (error) {
            const message = `Error while handling event task : ${task.name}`;
            console.error(message, error);
            WorkflowContext.failed(workflow_context, message);
            Task.fail(workflow_context.tasks[task.name], message);
            WorkflowContext.updateCurrentTask(workflow_context, workflow_context.tasks[task.name]);
            await WorkflowDetailsEntity.saveWorkflowContext(workflow_context.execution_id, workflow_context);
            await this.executeExceptionTasks(workflow, workflow_context);
        }
    }

    /**
     * Get the next task in the workflow
     * @param workflow 
     * @param task 
     * @returns 
     */
    private getNextTask(workflow: WorkflowConfig, task: TaskConfig): TaskConfig | undefined {
        let nextTask = workflow.tasks.findIndex(x => x.task_reference_name.toLowerCase() == task.task_reference_name.toLowerCase());
        if ((nextTask + 1) > workflow.tasks.length) {
            console.log("No more tasks in the workflow");
            return undefined;
        }
        return workflow.tasks[nextTask + 1];
    }

    /**
     * Execute the next task in the workflow
     * @param workflow
     * @param task
     * @param workflow_context
     * @param messageId
     * @returns
     */
    async executeNextTask(workflow: WorkflowConfig, task: TaskConfig, workflow_context: WorkflowContext) {
        let nextTask = this.getNextTask(workflow, task);
        if (nextTask) {
            await this.executeTask(workflow, nextTask, workflow_context);
        }
        else {
            WorkflowContext.completed(workflow_context);
            await WorkflowDetailsEntity.saveWorkflowContext(workflow_context.execution_id, workflow_context);
            console.log(`Workflow ${workflow.name} completed successfully`);
        }
    }

    /**
    * Get the next exception task in the workflow
    * @param workflow 
    * @param task 
    * @returns 
    */
    private getNextExceptionTask(workflow: WorkflowConfig, task: TaskConfig): TaskConfig | undefined {
        let nextTask = workflow.exception_task.findIndex(x => x.task_reference_name.toLowerCase() == task.task_reference_name.toLowerCase());
        if ((nextTask + 1) > workflow.exception_task.length) {
            console.log("No more exception tasks in the workflow");
            return undefined;
        }
        return workflow.exception_task[nextTask + 1];
    }

    /**
     * Execute the exception tasks
     * @param workflow
     * @param task
     * @param workflow_context
     * @returns
     */
    async executeExceptionTasks(workflow: WorkflowConfig, workflow_context: WorkflowContext) {

        if (workflow.exception_task.length > 0) {
            //Execute the first exception task
            await this.executeTask(workflow, workflow.exception_task[0], workflow_context);
        }
        else {
            console.error("All exception tasks executed successfully");
        }
    }

    /**
    * Execute the next exception task
    * @param workflow
    * @param task
    * @param workflow_context
    * @returns
    */
    async executeNextExceptionTask(workflow: WorkflowConfig, task: TaskConfig, workflow_context: WorkflowContext) {
        let nextTask = this.getNextExceptionTask(workflow, task);
        if (nextTask) {
            await this.executeTask(workflow, nextTask, workflow_context);
        }
        else {
            console.error("All exception tasks executed successfully");
        }
    }

    /**
     * Execute the task
     * @param workflow
     * @param task
     * @param workflow_context
     * @returns
     */
    private async executeTask(workflow: WorkflowConfig, task: TaskConfig | undefined, workflow_context: WorkflowContext) {
        if (task) {
            switch (task.type) {
                case "Event":
                    this.workflowEvent.emit("EVENT_TASK_HANDLER", workflow, task, workflow_context);
                    break;
                case "Utility":
                    this.workflowEvent.emit("UTILITY_TASK_HANDLER", workflow, task, workflow_context);
                    break;
                case "Exception":
                    this.workflowEvent.emit("EXCEPTION_TASK_HANDLER", workflow, task, workflow_context);
                    break;
                default:
                    console.error("Invalid task type", task.type);
                    WorkflowContext.failed(workflow_context, "Invalid task type");
                    break;
            }
        }
    }


    /** 
     * Handle the subscribed messages
     * @param message 
     */
    private handleMessage = async (message: QueueMessage) => {
        try {
            console.log("Received message", message.messageType);

            let messageType = message.messageType.split("|");
            if (messageType.length == 2) {
                let workflow_name = messageType[0];
                let task_name = messageType[1];
                let workflowConfig = this.orchestratorConfigContext.getWorkflowByName(workflow_name);
                if (workflowConfig) {
                    let taskConfig = workflowConfig.tasks.find(x => x.task_reference_name.toLowerCase() == task_name.toLowerCase());
                    if (taskConfig) {
                        let wokflow_details = await WorkflowDetailsEntity.getWorkflowByExecutionId(message.messageId);
                        await this.handleEventResponse(workflowConfig, taskConfig, wokflow_details!.workflow_context, message);
                    }
                    else {
                        console.error("Task not found", message.messageType);
                    }
                }
            }

        } catch (error) {
            console.error("Orchestrator : Error invoking handlers", error);
        }
        return Promise.resolve();
    }

    /**
     * Handles the dead letter queue messages. The task and workflow are abandonned 
     * @param message Message in the dead letter queue
     * @returns 
     */
    private handleDLQMessage = async (message: QueueMessage) => {
        try {
            console.log("Received DLQ message", message.messageType);
            let messageType = message.messageType.split("|");
            if (messageType.length == 2) {
                let workflow_name = messageType[0];
                let task_name = messageType[1];
                let workflowConfig = this.orchestratorConfigContext.getWorkflowByName(workflow_name);
                if (workflowConfig) {
                   
                    let taskConfig = workflowConfig.tasks.find(x => x.task_reference_name.toLowerCase() == task_name.toLowerCase());
                    if (taskConfig) {
                        // Prepare response for the abandoned task
                        let wokflow_details = await WorkflowDetailsEntity.getWorkflowByExecutionId(message.messageId);
                         message.data['success']  = false;
                         message.data['message'] = `Abandoned during ${taskConfig.description} task`;
                         message.data['abandoned'] = true;
                        // Generate the abandoned response and send to handleEventResponse
                        await this.handleEventResponse(workflowConfig, taskConfig, wokflow_details!.workflow_context, message);
                    }
                    else {
                        console.error("Task not found", message.messageType);
                    }
                }
            }

        } catch (error) {
            console.error("Orchestrator : Error invoking handlers", error);
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
