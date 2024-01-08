# Orchestrator Workflow Engine

## Orchestrator config structure

Configuration file structure for the TDEI Orchestrator.
This file defines the workflows and subscriptions used by the orchestrator.

```json
{
    "$schema": "./tdei-orchestrator.schema.json",
    "workflows": [
        // Workflows section...
    ],
    "subscriptions": [
        // Subscriptions section...
    ]
}
```


#### Orchestrator Schema Definition

When introducing a new workflow, you would need to define these properties according to your workflow's requirements and the definitions provided in the [Schema](../tdei-orchestrator.schema.json)

The `workflows` property in the JSON configuration file is an array of objects, where each object represents a workflow in the system. Each workflow object has the following properties:

- `type`: This property is a string that can either be TRIGGER or HANDLER. The TRIGGER type represents a workflow that initiates a process, while the HANDLER type represents a workflow that manages or processes data.

- `stage`: This property is a string that specifies the stage of the workflow. Stages are used to categorize the steps in a workflow process.

- `group`: This property is a string that specifies the group of the workflow. Groups are used to categorize related workflows.

- `identifier`: This property is a string that uniquely identifies the workflow. This is used to reference the workflow in the system.

- `generic_workflow`: This property is a boolean that indicates whether the workflow is generic. If true, the workflow forwards the message to the next step without any processing and does not require a Workflow request/response class to be defined.

- `next_steps`: This property is an array that specifies the next steps to respond to the workflow request. Each item in the array is an object with the following properties:

    - `process_identifier`: A string that names the process handler. The process handler is the function or method that handles the processing for this step of the workflow.

    - `params`: An object that contains parameters to be passed to the process handler. The specific properties of this object depends on the process input params.

    - `delegate_workflow`: An array. Used to delegate parts of the workflow to other workflows or processes.


The `subscriptions` property in the JSON schema is an array, where each item is an object representing a subscription. Each subscription object has the following properties:

- `description`: A string that provides a free text description of the subscription. This could be used to give more context or details about the subscription.

- `topic`: A string that specifies the name of the topic where the messages are posted. In a publish-subscribe pattern, a topic is a category or a label that acts as a "bucket" where publishers send messages and subscribers receive messages.

- `subscription`: A string that specifies the name of the subscription to listen to topic messages. A subscription represents the interest of a subscriber to receive messages from a particular topic.

## Orchestrator Message Handling

During the initialization phase of the orchestrator, all the subscriptions defined in the configuration are activated. These subscriptions start listening to their respective topics for incoming messages.

When a message arrives at a topic, the orchestrator retrieves it and extracts the message identifier. This identifier is obtained from the MessageType property of the QueueMessage object, which represents the incoming message.

The orchestrator then uses this message identifier to find the corresponding workflow. Each workflow is uniquely identified by an identifier, which matches the message identifier.

Once the relevant workflow is found, the orchestrator delegates the processing of the message to this workflow. The workflow then follows the steps defined in its configuration to process the message.

Each step in the workflow configuration represents a specific action or process to be performed on the message. The workflow delegates the message to each of these steps in the order defined in the configuration. This allows the message to be processed in a controlled and predictable manner, following the predefined workflow.

## Orchestrator Configuration Validation

Configuration validation happens while application bootstrapping

1. Validates duplicate wokflow identifiers
2. Validates duplicate subscriptions
3. Validates delegate workflow defined exists
3. Cross verifies defined workflow vs Registered workflow, if there is any mismatch.


## Microservices Participation Requirements

Microservices involved in the orchestrator engine must adhere to the specified Request/Response message structure outlined below.

```json
{
    "messageId": "tdei_record_id", 
    "messageType": "workflow_identifier", 
    "data": {
       //..any props
    }
}
```
- Any microservice that receives a message must retain the `messageId` and `messageType`, and pass them on unchanged in the response message.


## Workflow & Handlers

Each entry in the workflows array represents the process reponds to the incoming queue message/request. Each workflow listens on the event type defined in the configuration as `identifier`.

When the Orchestrator engine receives a message, it identifies the workflow to be triggered by its queue message property `messageType` and emits an event. The process listening on the event type receives the message for processing. After taking the necessary actions, it delegates the message for further execution in the configured steps.

Each element within the `next_steps` array represents the process/handlers which acts on the incoming request. Each steps listens on the event type defined in the configuration as `process_identifier`. Workflow process executes the defined steps in sequence by emiting the event with Queue message and required parameters.

Sample Workflow Process Code:

```typescript 
export class SampleRequestWorkflow extends WorkflowBase {

    constructor(workflowEvent: EventEmitter, orchestratorServiceInstance: IOrchestratorService) {
        super(workflowEvent, orchestratorServiceInstance, "SAMPLE_REQUEST_WORKFLOW");
    }

    //Base Override
    async handleWorkflow(message: QueueMessage, params: any) {
        try {
            //trigger handlers
            this.delegateWorkflowHandlers(queueMessage);
        }
        catch (error) {
            
        }
    }
}
```

Sample Step Process Code:

```typescript 
export class PublishHandler extends WorkflowHandlerBase {
    constructor(workflowEvent: EventEmitter, orchestratorServiceInstance: IOrchestratorService) {
        super(workflowEvent, orchestratorServiceInstance, "PUBLISH_HANDLER");
    }

    //Base Override
    public async handleRequest(message: QueueMessage, delegate_worflow: string[], params: any): Promise<void> {
      
        this.orchestratorServiceInstance!.delegateWorkflowIfAny(delegate_worflow, message);
    }
}
```

### Example 

Below configuration defined for validation-only requirement. 

```json
    {
            "group": "VALIDATION_ONLY_OSW",
            "stage": "VALIDATION",
            "type": "TRIGGER",
            "identifier": "OSW_VALIDATION_ONLY_VALIDATION_REQUEST_WORKFLOW",
            "generic_workflow": true,
            "next_steps": [
                {
                    "process_identifier": "PUBLISH_HANDLER",
                    "params": {
                        "response_message_identifier": "OSW_VALIDATION_ONLY_VALIDATION_RESPONSE_WORKFLOW",
                        "topic": "osw-validation-request"
                    }
                }
            ]
        },
        {
            "group": "VALIDATION_ONLY_OSW",
            "stage": "VALIDATION",
            "type": "HANDLER",
            "identifier": "OSW_VALIDATION_ONLY_VALIDATION_RESPONSE_WORKFLOW",
            "generic_workflow": true,
            "next_steps": [
                {
                    "process_identifier": "OSW_VALIDATION_ONLY_VALIDATION_RESPONSE_HANDLER",
                    "params": {}
                }
            ]
        }
```


## New Workflow

For new workflow please follow below steps

1. Define workflow configuration in orchestrator-config.json.
2. Write workflow class if required or use genric handler
3. Write handler class if required or use existing handlers
4. Define new defined handlers/workflows in `orchestrator/workflows-handlers/index.ts`

### Orchestrator initialization

```typescript 
// orchestratorConfig : json config object
// workflows : array of workflow/handler process class
 private initializeOrchestrator() {
    var orchestratorService = new OrchestratorService(orchestratorConfig);
    orchestratorService.initialize(workflows);
}
```

### Orchestrator manual trigger

Workflow of type `TRIGGER` can only be triggered.

```typescript
//Compose the message
// referenceId : record/job reference id
// workflow_identifier : workflow identifier
 let queueMessage = QueueMessage.from({
                messageId: referenceId,
                messageType: workflow_identifier,
                data: requestDataObj
            });
 //Trigger the workflow
 await orchestratorServiceInstance.triggerWorkflow(workflow_identifier, queueMessage);

```


