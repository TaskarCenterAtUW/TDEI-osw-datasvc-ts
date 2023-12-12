import { environment } from "../environment/environment";
import { Core } from "nodets-ms-core";
import { Topic } from "nodets-ms-core/lib/core/queue/topic";
import { QueueMessage } from "nodets-ms-core/lib/core/queue";
import publishUploadHandler from "./handlers/publish-workflow-handler";
import { Tasks, Workflow, Task } from "../model/orchestrator/config-model";

class OrchestratorService {
    topicCollection = new Map<string, Topic>();
    private orchestratorContext: Tasks = new Tasks();

    constructor(queueConnection: string = environment.eventBus.connectionString as string, publishingTopicName: string = environment.eventBus.dataServiceTopic as string) {
        Core.initialize();
        this.initializeOrhchestrator();
    }

    initializeOrhchestrator() {
        this.orchestratorContext = new Tasks();

        this.orchestratorContext.tasks.forEach(task => {
            this.processWorkflows(task.workflows);
        })
    }

    processWorkflows(workflows: Workflow[]) {
        workflows.forEach(workflow => {
            var topic = Core.getTopic(workflow.topic as string);
            if (workflow.action == "subscribe") {
                topic.subscribe(workflow.subscription as string,
                    {
                        onReceive: this.handleMessage,
                        onError: this.handleFailedMessages
                    });
            }
            //Store the toics into collection 
            this.topicCollection.set(workflow.topic as string, topic);
        });
    }

    handleMessage = (msg: QueueMessage) => {
        let parts = msg.messageType.split("-");
        let taskName = `${parts[0]}-${parts[1]}`;
        let task: Task = this.orchestratorContext.getTaskByName(taskName)!;
        let workflow = task.getWorkflowByMessageType(msg.messageType)!;
        this.handleWorkflow(taskName, workflow, msg);
    }

    handleWorkflow(taskName: string, workflow: Workflow, msg: QueueMessage) {
        switch (taskName) {
            case "osw-publish":
                publishUploadHandler.handleWorkflow(workflow, msg);
                break;

            default:
                break;
        }
    }

    public handleFailedMessages(error: Error) {
        console.log('received failed message')
        console.log(error)
    }

}

const orchestratorService = new OrchestratorService();
export default orchestratorService;
