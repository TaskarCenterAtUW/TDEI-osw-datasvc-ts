import { QueueMessage } from "nodets-ms-core/lib/core/queue";
import appContext from "../../../server";
import { IWorkflowRegister } from "../../models/config-model";
import EventEmitter from "events";
import oswService from "../../../service/Osw-service";
import { OSWConfidenceRequest } from "../../../model/osw-confidence-request";

export class PublishConfidenceRequestWorkflow implements IWorkflowRegister {

    constructor(private workflowEvent: EventEmitter) {
    }

    register(): void {
        this.workflowEvent.on("OSW_PUBLISH_CONFIDENCE_REQUEST_WORKFLOW", this.handleWorkflow);
    }

    async handleWorkflow(message: QueueMessage, params: any) {
        console.log("Triggered OSW_PUBLISH_CONFIDENCE_REQUEST_WORKFLOW :", message.messageType);
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
                messageType: "", //will be set by the publish handler with params defined in config
                data: confidenceRequestMsg
            });
            //trigger handlers
            appContext.orchestratorServiceInstance.delegateWorkflowHandlers(queueMessage);
        }
        catch (error) {
            console.error("Error in handling the confidence request workflow", error);
        }
    }
}