import EventEmitter from "events";
import { WorkflowHandlerBase } from "../../../models/orchestrator-base-model";
import { IOrchestratorService } from "../../../services/orchestrator-service";
import { QueueMessage } from "nodets-ms-core/lib/core/queue";
import { JobDTO, UpdateJobDTO } from "../../../../model/job-dto";
import { JobStatus } from "../../../../model/jobs-get-query-params";
import jobService from "../../../../service/job-service";
import { el } from "date-fns/locale";
import dbClient from "../../../../database/data-source";
import { JobEntity } from "../../../../database/entity/job-entity";
import tdeiCoreService from "../../../../service/tdei-core-service";

export class PathwaysUploadValidationResponseHandler extends WorkflowHandlerBase {

    constructor(workflowEvent: EventEmitter, orchestratorServiceInstance: IOrchestratorService) {
        super(workflowEvent, orchestratorServiceInstance, "PATHWAYS_UPLOAD_VALIDATION_RESPONSE_HANDLER");
    }

    /**
    * 
    * @param message 
    * @param delegate_worflow 
    * @param params 
    */
    async handleRequest(message: QueueMessage, delegate_worflow: string[], params: any): Promise<void> {
        console.log(`Triggered ${this.eventName} :`, message.messageType);
        try {
            let updateJobDTO = UpdateJobDTO.from({
                job_id: message.messageId,
                message: message.data.message,
                status: message.data.success ? JobStatus.COMPLETED : JobStatus.FAILED,
                response_props: {}
            })
            await jobService.updateJob(updateJobDTO);

            if (message.data.success) {
                this.delegateWorkflowIfAny(delegate_worflow, message);
            }
            else {
                //delete draft dataset
                const result = await dbClient.query(JobEntity.getJobByIdQuery(message.messageId));
                const job = JobDTO.from(result.rows[0]);
                await tdeiCoreService.deleteDraftDataset(job.response_props.tdei_dataset_id);
            }

        } catch (error) {
            console.error(`Error while processing the ${this.eventName} for message type: ${message.messageType}`, error);
        }
    }
}