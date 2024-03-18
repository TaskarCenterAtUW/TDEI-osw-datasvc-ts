import { QueueMessage } from "nodets-ms-core/lib/core/queue";
import EventEmitter from "events";
import { OSWConfidenceJobRequest } from "../../../../model/job-request-response/osw-confidence-job-request";
import { WorkflowBase } from "../../../models/orchestrator-base-model";
import { IOrchestratorService } from "../../../services/orchestrator-service";
import tdeiCoreService from "../../../../service/tdei-core-service";
import jobService from "../../../../service/job-service";
import { JobsQueryParams } from "../../../../model/jobs-get-query-params";
import { JobDTO } from "../../../../model/job-dto";
import dbClient from "../../../../database/data-source";
import { JobEntity } from "../../../../database/entity/job-entity";

export class PublishConfidenceRequestWorkflow extends WorkflowBase {

    constructor(workflowEvent: EventEmitter, orchestratorServiceInstance: IOrchestratorService) {
        super(workflowEvent, orchestratorServiceInstance, "OSW_PUBLISH_CONFIDENCE_REQUEST_WORKFLOW");
    }

    async handleWorkflow(message: QueueMessage, params: any) {
        console.log(`Triggered ${this.eventName} :`, message.messageType);
        try {
            //Get the job details from the database
            const result = await dbClient.query(JobEntity.getJobByIdQuery(message.messageId));
            const job = JobDTO.from(result.rows[0]);
            // Get the dataset details
            const dataset = await tdeiCoreService.getDatasetDetailsById(job.request_input.tdei_dataset_id);
            // Send the details to the confidence metric.
            const confidenceRequestMsg = new OSWConfidenceJobRequest();
            confidenceRequestMsg.jobId = job.job_id.toString();
            confidenceRequestMsg.data_file = dataset.dataset_url;
            confidenceRequestMsg.meta_file = dataset.metadata_url;
            confidenceRequestMsg.trigger_type = 'release';

            let queueMessage = QueueMessage.from({
                messageId: message.messageId,
                messageType: "OSW_PUBLISH_CONFIDENCE_REQUEST_WORKFLOW", //will be set by the publish handler with params defined in config
                data: confidenceRequestMsg
            });
            //trigger handlers
            this.delegateWorkflowHandlers(queueMessage);
        }
        catch (error) {
            console.error("Error in handling the confidence request workflow", error);
        }
    }
}