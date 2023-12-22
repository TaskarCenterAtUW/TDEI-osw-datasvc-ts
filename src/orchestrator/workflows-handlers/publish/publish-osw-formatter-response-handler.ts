import { QueueMessage } from "nodets-ms-core/lib/core/queue";
import appContext from "../../../server";
import { IWorkflowRegister } from "../../models/config-model";
import EventEmitter from "events";
import { OswVersions } from "../../../database/entity/osw-version-entity";
import dbClient from "../../../database/data-source";

export class PublishFormattingResponseHandler implements IWorkflowRegister {

    constructor(private workflowEvent: EventEmitter) {
    }

    register(): void {
        this.workflowEvent.on("OSW_PUBLISH_FORMATTING_RESPONSE_HANDLER", this.handleMessage);
    }

    /**
     * 
     * @param message 
     * @param delegate_worflow 
     * @param params 
     */
    private async handleMessage(message: QueueMessage, delegate_worflow: string[], params: any) {
        console.log("Triggered OSW_PUBLISH_FORMATTING_RESPONSE_HANDLER");
        if (message.data.success) {

            let download_osm_url = message.data.formatted_url ?? "";

            try {
                download_osm_url = decodeURIComponent(download_osm_url!);
                await dbClient.query(OswVersions.getUpdateFormatUrlQuery(message.messageId, download_osm_url));
            } catch (error) {
                console.error("Error updating the osw version formatting results", error);
                return;
            }

            appContext.orchestratorServiceInstance.delegateWorkflowIfAny(delegate_worflow, message);
        }
    }
}