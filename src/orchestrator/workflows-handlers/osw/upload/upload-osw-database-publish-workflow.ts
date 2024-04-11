import { QueueMessage } from "nodets-ms-core/lib/core/queue";
import EventEmitter from "events";
import dbClient from "../../../../database/data-source";
import { DatasetEntity } from "../../../../database/entity/dataset-entity";
import { WorkflowBase } from "../../../models/orchestrator-base-model";
import { IOrchestratorService } from "../../../services/orchestrator-service";
import { JobEntity } from "../../../../database/entity/job-entity";
import { JobDTO, UpdateJobDTO } from "../../../../model/job-dto";
import { JobStatus } from "../../../../model/jobs-get-query-params";
import jobService from "../../../../service/job-service";
import { RecordStatus } from "../../../../model/dataset-get-query-params";

export class UploadDatabaseWorkflow extends WorkflowBase {

    constructor(workflowEvent: EventEmitter, orchestratorServiceInstance: IOrchestratorService) {
        super(workflowEvent, orchestratorServiceInstance, "OSW_UPLOAD_DATABASE_WORKFLOW");
    }

    async handleWorkflow(message: QueueMessage, _params: any): Promise<void> {
        console.log(`Triggered ${this.eventName} :`, message.messageType);
        try {
            const result = await dbClient.query(JobEntity.getJobByIdQuery(message.messageId));
            const job = JobDTO.from(result.rows[0]);

            await dbClient.query(DatasetEntity.getStatusUpdateQuery(job.response_props.tdei_dataset_id, RecordStatus["Pre-Release"]));

            const updateJobDTO = UpdateJobDTO.from({
                job_id: message.messageId,
                message: "Dataset Uploaded Successfully",
                status: JobStatus.COMPLETED,
                response_props: {}
            })
            await jobService.updateJob(updateJobDTO);
        }
        catch (error) {
            console.error("Error in pre-release the record to the database", error);
        }
        this.delegateWorkflowHandlers(message);
    }
}