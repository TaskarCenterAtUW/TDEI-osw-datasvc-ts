import EventEmitter from "events";
import { WorkflowHandlerBase } from "../../../models/orchestrator-base-model";
import { IOrchestratorService } from "../../../services/orchestrator-service";
import { QueueMessage } from "nodets-ms-core/lib/core/queue";
import { UpdateJobDTO } from "../../../../model/job-dto";
import { JobStatus } from "../../../../model/jobs-get-query-params";
import jobService from "../../../../service/job-service";
import dbClient from "../../../../database/data-source";
import { DatasetEntity } from "../../../../database/entity/dataset-entity";
import { RecordStatus } from "../../../../model/dataset-get-query-params";

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
            let job = await jobService.updateJob(updateJobDTO);
            await dbClient.query(DatasetEntity.getStatusUpdateQuery(job.response_props.tdei_dataset_id, RecordStatus["Pre-Release"]));

            this.delegateWorkflowIfAny(delegate_worflow, message);

        } catch (error) {
            console.error(`Error while processing the ${this.eventName} for message type: ${message.messageType}`, error);
        }
    }
}