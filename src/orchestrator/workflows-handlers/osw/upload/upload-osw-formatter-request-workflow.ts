import { QueueMessage } from "nodets-ms-core/lib/core/queue";
import EventEmitter from "events";
import { WorkflowBase } from "../../../models/orchestrator-base-model";
import { IOrchestratorService } from "../../../services/orchestrator-service";
import tdeiCoreService from "../../../../service/tdei-core-service";
import dbClient from "../../../../database/data-source";
import { JobEntity } from "../../../../database/entity/job-entity";
import { JobDTO } from "../../../../model/job-dto";

export class UploadFormattingRequestWorkflow extends WorkflowBase {

    constructor(workflowEvent: EventEmitter, orchestratorServiceInstance: IOrchestratorService) {
        super(workflowEvent, orchestratorServiceInstance, "OSW_UPLOAD_FORMATTING_REQUEST_WORKFLOW");
    }

    async handleWorkflow(message: QueueMessage, _params: any): Promise<void> {
        console.log(`Triggered ${this.eventName} :`, message.messageType);

        try {
            //Get the job details from the database
            const result = await dbClient.query(JobEntity.getJobByIdQuery(message.messageId));
            const job = JobDTO.from(result.rows[0]);
            // Get the dataset details
            const dataset = await tdeiCoreService.getDatasetDetailsById(job.response_props.tdei_dataset_id);

            //Compose the meessage
            const queueMessage = QueueMessage.from({
                messageId: message.messageId,
                messageType: `${this.eventName}`, //will be set by the publish handler with params defined in config
                data: {
                    file_upload_path: dataset.dataset_url,
                    tdei_project_group_id: dataset.tdei_project_group_id
                }
            });

            //trigger handlers
            this.delegateWorkflowHandlers(queueMessage);
        }
        catch (error) {
            console.error("Error in handling the formatting request workflow", error);
        }
    }
}