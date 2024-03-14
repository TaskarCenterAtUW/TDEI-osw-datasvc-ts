import { QueueMessage } from "nodets-ms-core/lib/core/queue";
import EventEmitter from "events";
import { OSWConfidenceJobRequest } from "../../../../model/job-request-response/osw-confidence-job-request";
import { WorkflowBase } from "../../../models/orchestrator-base-model";
import { IOrchestratorService } from "../../../services/orchestrator-service";
import tdeiCoreService from "../../../../service/tdei-core-service";

export class PublishConfidenceRequestWorkflow extends WorkflowBase {

    constructor(workflowEvent: EventEmitter, orchestratorServiceInstance: IOrchestratorService) {
        super(workflowEvent, orchestratorServiceInstance, "OSW_PUBLISH_CONFIDENCE_REQUEST_WORKFLOW");
    }

    async handleWorkflow(message: QueueMessage, params: any) {
        console.log(`Triggered ${this.eventName} :`, message.messageType);
        try {
            let tdei_dataset_id = message.messageId;
            const dataset = await tdeiCoreService.getDatasetDetailsById(tdei_dataset_id)
            // Send the details to the confidence metric.
            const confidenceRequestMsg = new OSWConfidenceJobRequest();
            confidenceRequestMsg.jobId = tdei_dataset_id;
            confidenceRequestMsg.data_file = dataset.dataset_url;
            confidenceRequestMsg.meta_file = dataset.metadata_url;
            confidenceRequestMsg.trigger_type = 'release';

            let queueMessage = QueueMessage.from({
                messageId: message.messageId,
                messageType: "OSW_PUBLISH_CONFIDENCE_REQUEST_WORKFLOW", //will be set by the publish handler with params defined in config
                data: confidenceRequestMsg
            });
            //trigger handlers
            this.delegateWorkflowHandlers(queueMessage);
        }
        catch (error) {
            console.error("Error in handling the confidence request workflow", error);
        }
    }
}