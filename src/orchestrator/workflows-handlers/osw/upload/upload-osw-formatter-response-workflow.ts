import { QueueMessage } from "nodets-ms-core/lib/core/queue";
import EventEmitter from "events";
import { WorkflowBase } from "../../../models/orchestrator-base-model";
import { IOrchestratorService } from "../../../services/orchestrator-service";
import { JobDTO } from "../../../../model/job-dto";
import { JobStatus } from "../../../../model/jobs-get-query-params";
import dbClient from "../../../../database/data-source";
import { JobEntity } from "../../../../database/entity/job-entity";
import tdeiCoreService from "../../../../service/tdei-core-service";

export class UploadFormattingResponseWorkflow extends WorkflowBase {

    constructor(workflowEvent: EventEmitter, orchestratorServiceInstance: IOrchestratorService) {
        super(workflowEvent, orchestratorServiceInstance, "OSW_UPLOAD_FORMATTING_RESPONSE_WORKFLOW");
    }

    async handleWorkflow(message: QueueMessage, params: any): Promise<void> {
        console.log(`Triggered ${this.eventName} :`, message.messageType);
        //do any pre-requisite task

        if (message.data.success) {
            this.delegateWorkflowHandlers(message);
        }
        else {
            const result = //Update job
                await dbClient.query(
                    JobEntity.getUpdateQuery(
                        //Where clause
                        message.messageId,
                        //Column to update
                        JobEntity.from({
                            status: JobStatus.FAILED,
                            message: message.data.message,
                        })
                    ));
            const job = JobDTO.from(result.rows[0]);
            //delete draft dataset
            await tdeiCoreService.deleteDraftDataset(job.response_props.tdei_dataset_id);
        }
    }
}