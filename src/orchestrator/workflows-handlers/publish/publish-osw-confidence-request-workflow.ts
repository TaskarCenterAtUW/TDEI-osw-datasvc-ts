import { QueueMessage } from "nodets-ms-core/lib/core/queue";
import EventEmitter from "events";
import oswService from "../../../service/osw-service";
import { OSWConfidenceRequest } from "../../../model/osw-confidence-request";
import { WorkflowBase } from "../../models/orchestrator-base-model";
import { IOrchestratorService } from "../../services/orchestrator-service";

export class PublishConfidenceRequestWorkflow extends WorkflowBase {

    constructor(workflowEvent: EventEmitter, orchestratorServiceInstance: IOrchestratorService) {
        super(workflowEvent, orchestratorServiceInstance, "OSW_PUBLISH_CONFIDENCE_REQUEST_WORKFLOW");
    }

    async handleWorkflow(message: QueueMessage, params: any) {
        console.log(`Triggered ${this.eventName} :`, message.messageType);
        try {
            let tdei_record_id = message.messageId;
            const oswRecord = await oswService.getOSWRecordById(tdei_record_id)
            // Send the details to the confidence metric.
            const confidenceRequestMsg = new OSWConfidenceRequest();
            confidenceRequestMsg.jobId = tdei_record_id;
            confidenceRequestMsg.data_file = oswRecord.download_osw_url;
            confidenceRequestMsg.meta_file = oswRecord.download_metadata_url;
            confidenceRequestMsg.trigger_type = 'release';

            let queueMessage = QueueMessage.from({
                messageId: tdei_record_id,
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