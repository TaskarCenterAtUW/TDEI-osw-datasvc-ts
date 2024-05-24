import EventEmitter from "events";
import { WorkflowHandlerBase } from "../../../models/orchestrator-base-model";
import { IOrchestratorService } from "../../../services/orchestrator-service";
import { QueueMessage } from "nodets-ms-core/lib/core/queue";
import { JobDTO, UpdateJobDTO } from "../../../../model/job-dto";
import { JobStatus } from "../../../../model/jobs-get-query-params";
import jobService from "../../../../service/job-service";
import dbClient from "../../../../database/data-source";
import { DatasetEntity } from "../../../../database/entity/dataset-entity";
import { JobEntity } from "../../../../database/entity/job-entity";
import { RecordStatus } from "../../../../model/dataset-get-query-params";

export class FlexUploadCompressionResponseHandler extends WorkflowHandlerBase {

    constructor(workflowEvent: EventEmitter, orchestratorServiceInstance: IOrchestratorService) {
        super(workflowEvent, orchestratorServiceInstance, "FLEX_UPLOAD_COMPRESSION_RESPONSE_HANDLER");
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
            if (message.data.success) {
                const result = await dbClient.query(JobEntity.getJobByIdQuery(message.messageId));
                const job = JobDTO.from(result.rows[0]);
                const zip_path = message.data.output_path;
                console.log('zip path ', zip_path);
                await dbClient.query(DatasetEntity.getStatusUpdateQuery(job.response_props.tdei_dataset_id, RecordStatus["Pre-Release"]));
                await dbClient.query(DatasetEntity.getUpdateDatasetZipUrlQuery(job.response_props.tdei_dataset_id, zip_path));
                this.delegateWorkflowIfAny(delegate_worflow, message);
            }


            let updateJobDTO = UpdateJobDTO.from({
                job_id: message.messageId,
                message: message.data.message,
                status: message.data.success ? JobStatus.COMPLETED : JobStatus.FAILED,
                response_props: {}
            })
            await jobService.updateJob(updateJobDTO);

        } catch (error) {
            console.error(`Error while processing the ${this.eventName} for message type: ${message.messageType}`, error);
        }
    }
}