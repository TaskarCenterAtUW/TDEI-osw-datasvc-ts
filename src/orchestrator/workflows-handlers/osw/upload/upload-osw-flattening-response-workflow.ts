import { QueueMessage } from "nodets-ms-core/lib/core/queue";
import EventEmitter from "events";
import { WorkflowBase } from "../../../models/orchestrator-base-model";
import { IOrchestratorService } from "../../../services/orchestrator-service";
import { JobDTO, UpdateJobDTO } from "../../../../model/job-dto";
import { JobStatus } from "../../../../model/jobs-get-query-params";
import jobService from "../../../../service/job-service";
import dbClient from "../../../../database/data-source";
import { JobEntity } from "../../../../database/entity/job-entity";
import tdeiCoreService from "../../../../service/tdei-core-service";

export class UploadFlatteningResponseWorkflow extends WorkflowBase {

    constructor(workflowEvent: EventEmitter, orchestratorServiceInstance: IOrchestratorService) {
        super(workflowEvent, orchestratorServiceInstance, "OSW_UPLOAD_DATASET_FLATTENING_RESPONSE_WORKFLOW");
    }

    async handleWorkflow(message: QueueMessage, _params: any): Promise<void> {
        console.log(`Triggered ${this.eventName} :`, message.messageType);
        //do any pre-requisite task
        if (message.data.success) {
            this.delegateWorkflowHandlers(message);
        }
        else {
            const updateJobDTO = UpdateJobDTO.from({
                job_id: message.messageId,
                message: message.data.message,
                status: message.data.success ? JobStatus.COMPLETED : JobStatus.FAILED,
                response_props: {}
            })
            await jobService.updateJob(updateJobDTO);
            //delete draft dataset
            const result = await dbClient.query(JobEntity.getJobByIdQuery(message.messageId));
            const job = JobDTO.from(result.rows[0]);
            await tdeiCoreService.deleteDraftDataset(job.response_props.tdei_dataset_id);
        }
    }
}