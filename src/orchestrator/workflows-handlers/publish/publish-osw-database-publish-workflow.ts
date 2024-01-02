import { QueueMessage } from "nodets-ms-core/lib/core/queue";
import EventEmitter from "events";
import dbClient from "../../../database/data-source";
import { OswVersions } from "../../../database/entity/osw-version-entity";
import { WorkflowBase } from "../../models/orchestrator-base";

export class PublishDatabaseWorkflow extends WorkflowBase {

    constructor(workflowEvent: EventEmitter) {
        super(workflowEvent, "OSW_PUBLISH_DATABASE_WORKFLOW");
    }

    async handleWorkflow(message: QueueMessage, params: any): Promise<void> {
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