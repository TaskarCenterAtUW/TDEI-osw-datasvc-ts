import { QueueMessage } from "nodets-ms-core/lib/core/queue";
import EventEmitter from "events";
import dbClient from "../../../../database/data-source";
import { DatasetEntity } from "../../../../database/entity/dataset-entity";
import { WorkflowBase } from "../../../models/orchestrator-base-model";
import { IOrchestratorService } from "../../../services/orchestrator-service";
import { JobEntity } from "../../../../database/entity/job-entity";
import { JobDTO } from "../../../../model/job-dto";
import { JobStatus } from "../../../../model/jobs-get-query-params";
import { RecordStatus } from "../../../../model/dataset-get-query-params";
import { OswStage } from "../../../../constants/app-constants";

export class PublishDatabaseWorkflow extends WorkflowBase {

    constructor(workflowEvent: EventEmitter, orchestratorServiceInstance: IOrchestratorService) {
        super(workflowEvent, orchestratorServiceInstance, "OSW_PUBLISH_DATABASE_WORKFLOW");
    }

    async handleWorkflow(message: QueueMessage, params: any): Promise<void> {
        console.log(`Triggered ${this.eventName} :`, message.messageType);
        try {

            const result = //Update job
                await dbClient.query(
                    JobEntity.getUpdateQuery(
                        //Where clause
                        message.messageId,
                        //Column to update
                        JobEntity.from({
                            stage: OswStage.DB_UPDATE,
                            message: "Dataset Published Successfully",
                            status: JobStatus.COMPLETED
                        })
                    ));
            const job = JobDTO.from(result.rows[0]);
            //This workflow triggers at the end of the workflow stages and marks complete of the workflow process
            await dbClient.query(DatasetEntity.getStatusUpdateQuery(job.request_input.tdei_dataset_id, RecordStatus.Publish));
        }
        catch (error) {
            console.error(`Error while processing the ${this.eventName} for message type: ${message.messageType}`, error);
        }
        this.delegateWorkflowHandlers(message);
    }
}