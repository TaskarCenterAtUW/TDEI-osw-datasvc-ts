import { QueueMessage } from "nodets-ms-core/lib/core/queue";
import { IWorkflowRegister } from "../../models/config-model";
import EventEmitter from "events";
import dbClient from "../../../database/data-source";
import { OswVersions } from "../../../database/entity/osw-version-entity";

export class PublishDatabaseWorkflow implements IWorkflowRegister {

    constructor(private workflowEvent: EventEmitter) {
    }

    register(): void {
        this.workflowEvent.on("OSW_PUBLISH_DATABASE_WORKFLOW", this.handleWorkflow);
    }

    async handleWorkflow(message: QueueMessage, params: any) {
        console.log("Triggered OSW_PUBLISH_DATABASE_WORKFLOW:", message.messageType);
        try {
            //This workflow triggers at the end of the workflow stages and marks complete of the workflow process
            await dbClient.query(OswVersions.getPublishRecordQuery(message.messageId));
        }
        catch (error) {
            console.error("Error in publishing the record to the database", error);
        }
    }
}