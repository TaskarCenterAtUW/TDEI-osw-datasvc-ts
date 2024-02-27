import { QueueMessage } from "nodets-ms-core/lib/core/queue";
import EventEmitter from "events";
import oswService from "../../../service/osw-service";
import { WorkflowBase } from "../../models/orchestrator-base-model";
import { IOrchestratorService } from "../../services/orchestrator-service";

export class PublishFlatteningRequestWorkflow extends WorkflowBase {

    constructor(workflowEvent: EventEmitter, orchestratorServiceInstance: IOrchestratorService) {
        super(workflowEvent, orchestratorServiceInstance, "OSW_PUBLISH_DATASET_FLATTENING_REQUEST_WORKFLOW");
    }

    async handleWorkflow(message: QueueMessage, params: any): Promise<void> {
        console.log(`Triggered ${this.eventName} :`, message.messageType);

        try {
            let osw_version = await oswService.getOSWRecordById(message.messageId);

            //Compose the meessage
            let queueMessage = QueueMessage.from({
                messageId: message.messageId,
                messageType: `${this.eventName}`, //will be set by the publish handler with params defined in config
                data: {
                    file_upload_path: osw_version.dataset_url,
                    data_type: "osw"
                }
            });

            //trigger handlers
            this.delegateWorkflowHandlers(queueMessage);
        }
        catch (error) {
            console.error("Error in handling the dataset flattening request workflow", error);
        }
    }
}