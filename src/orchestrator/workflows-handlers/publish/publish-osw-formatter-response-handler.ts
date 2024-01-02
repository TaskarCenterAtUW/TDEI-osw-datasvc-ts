import { QueueMessage } from "nodets-ms-core/lib/core/queue";
import appContext from "../../../app-context";
import EventEmitter from "events";
import { OswVersions } from "../../../database/entity/osw-version-entity";
import dbClient from "../../../database/data-source";
import { WorkflowHandlerBase } from "../../models/orchestrator-base";

export class PublishFormattingResponseHandler extends WorkflowHandlerBase {

    constructor(workflowEvent: EventEmitter) {
        super(workflowEvent, "OSW_PUBLISH_FORMATTING_RESPONSE_HANDLER");
    }

    /**
     * 
     * @param message 
     * @param delegate_worflow 
     * @param params 
     */
    override async handleRequest(message: QueueMessage, delegate_worflow: string[], params: any): Promise<void> {
        console.log("Triggered OSW_PUBLISH_FORMATTING_RESPONSE_HANDLER");
        if (message.data.success) {

            let download_osm_url = message.data.formatted_url ?? "";

            try {
                download_osm_url = decodeURIComponent(download_osm_url!);
                await dbClient.query(OswVersions.getUpdateFormatUrlQuery(message.messageId, download_osm_url));
                appContext.orchestratorServiceInstance!.delegateWorkflowIfAny(delegate_worflow, message);
            } catch (error) {
                console.error("Error updating the osw version formatting results", error);
                return;
            }
        }
    }
}