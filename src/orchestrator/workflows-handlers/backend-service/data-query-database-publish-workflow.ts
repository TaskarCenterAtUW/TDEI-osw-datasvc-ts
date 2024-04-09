import { QueueMessage } from "nodets-ms-core/lib/core/queue";
import EventEmitter from "events";
import { WorkflowBase } from "../../models/orchestrator-base-model";
import { IOrchestratorService } from "../../services/orchestrator-service";
import { JobStatus } from "../../../model/jobs-get-query-params";
import dbClient from "../../../database/data-source";
import { JobEntity } from "../../../database/entity/job-entity";
import { OswStage } from "../../../constants/app-constants";

export class DataQueryDatabaseWorkflow extends WorkflowBase {

    constructor(workflowEvent: EventEmitter, orchestratorServiceInstance: IOrchestratorService) {
        super(workflowEvent, orchestratorServiceInstance, "DATA_QUERY_DATABASE_WORKFLOW");
    }

    async handleWorkflow(message: QueueMessage, params: any): Promise<void> {
        console.log(`Triggered ${this.eventName} :`, message.messageType);
        try {
            await dbClient.query(
                JobEntity.getUpdateQuery(
                    //Where clause
                    message.messageId,
                    //Column to update
                    JobEntity.from({
                        message: "Request Processed Successfully",
                        status: JobStatus.COMPLETED,
                        stage: OswStage.DB_UPDATE,
                    })
                ));
        }
        catch (error) {
            console.error("Error in updating the data query details to the database", error);
        }
        this.delegateWorkflowHandlers(message);
    }
}