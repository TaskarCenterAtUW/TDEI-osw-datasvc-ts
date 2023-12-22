import { QueueMessage } from "nodets-ms-core/lib/core/queue";
import appContext from "../../../server";
import { IWorkflowRegister } from "../../models/config-model";
import EventEmitter from "events";
import oswService from "../../../service/Osw-service";

export class PublishFormattingRequestWorkflow implements IWorkflowRegister {

    constructor(private workflowEvent: EventEmitter) {
    }

    register(): void {
        this.workflowEvent.on("OSW_PUBLISH_FORMATTING_REQUEST_WORKFLOW", this.handleWorkflow);
    }

    async handleWorkflow(message: QueueMessage, params: any) {
        console.log("Triggered OSW_PUBLISH_FORMATTING_REQUEST_WORKFLOW :", message.messageType);

        try {
            let osw_version = await oswService.getOSWRecordById(message.messageId);
            //Compose the meessage
            let queueMessage = QueueMessage.from({
                messageId: message.messageId,
                messageType: "OSW_PUBLISH_FORMATTING_REQUEST_WORKFLOW", //will be set by the publish handler with params defined in config
                data: {
                    file_upload_path: osw_version.download_osw_url
                }
            });

            //trigger handlers
            appContext.orchestratorServiceInstance.delegateWorkflowHandlers(queueMessage);
        }
        catch (error) {
            console.error("Error in handling the formatting request workflow", error);
        }
    }
}