# Orchestrator Workflow Engine

For new workflow please follow below steps

1. Write workflow class
2. Write handler class if required or use existing handlers
3. Define new Handler/workflow in index.ts
4. Define workflow configuration in orchestrator-config.json.

## Configuration Validation

Configuration validation happens while application bootstrapping

1. Validates duplicate wokflow identifiers
2. Validates duplicate subscriptions
3. Validates delegate workflow defined exists
3. Cross verifies defined workflow vs Registered workflow, if there is any mismatch.



## Message schema definition

Response message from any service is expected to maintain below structure

```json
{
    "messageId": "tdei_record_id", // Passed as part of request
    "messageType": "workflow_identifier", // Passed as part of request
    "data": {
        "success" : "boolean value representing success or failure",
        "message" : "if error specify the reason for the error"
        //...Other response params as per service needs 
    }
}
```
- MessageId, MessageType should not be altered and passed on as is.
- Data object should have property `success` representing success or failure of the service
- Each service is expected to write down the Input message and Output message content in the readme file
- Each service should listen to its own defined topic `{type}-{service}-request` / Subscripton `response-handler` and respond to own defined topic `{type}-{service}-response` 
ex. osw-validation-request , osw-validation-response
