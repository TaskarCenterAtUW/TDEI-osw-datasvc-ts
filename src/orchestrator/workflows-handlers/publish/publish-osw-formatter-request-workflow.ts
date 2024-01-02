import { QueueMessage } from "nodets-ms-core/lib/core/queue";
import appContext from "../../../app-context";
import EventEmitter from "events";
import oswService from "../../../service/osw-service";
import { WorkflowBase } from "../../models/orchestrator-base";

export class PublishFormattingRequestWorkflow extends WorkflowBase {

    constructor(workflowEvent: EventEmitter) {
        super(workflowEvent, "OSW_PUBLISH_FORMATTING_REQUEST_WORKFLOW");
    }

    async handleWorkflow(message: QueueMessage, params: any): Promise<void> {
        console.log("Triggered OSW_PUBLISH_FORMATTING_REQUEST_WORKFLOW :", message.messageType);

        try {
            let osw_version = await oswService.getOSWRecordById(message.messageId);

            //Compose the meessage
            let queueMessage = QueueMessage.from({
                messageId: message.messageId,
                messageType: "OSW_PUBLISH_FORMATTING_REQUEST_WORKFLOW", //will be set by the publish handler with params defined in config
                data: {
                    file_upload_path: osw_version.download_osw_url,
                    tdei_project_group_id: osw_version.tdei_project_group_id
                }
            });

            //trigger handlers
            appContext.orchestratorServiceInstance!.delegateWorkflowHandlers(queueMessage);
        }
        catch (error) {
            console.error("Error in handling the formatting request workflow", error);
        }
    }
}