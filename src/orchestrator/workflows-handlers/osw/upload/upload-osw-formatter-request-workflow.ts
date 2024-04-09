import { QueueMessage } from "nodets-ms-core/lib/core/queue";
import EventEmitter from "events";
import { WorkflowBase } from "../../../models/orchestrator-base-model";
import { IOrchestratorService } from "../../../services/orchestrator-service";
import tdeiCoreService from "../../../../service/tdei-core-service";
import dbClient from "../../../../database/data-source";
import { JobEntity } from "../../../../database/entity/job-entity";
import { JobDTO } from "../../../../model/job-dto";
import { OswStage } from "../../../../constants/app-constants";

export class UploadFormattingRequestWorkflow extends WorkflowBase {

    constructor(workflowEvent: EventEmitter, orchestratorServiceInstance: IOrchestratorService) {
        super(workflowEvent, orchestratorServiceInstance, "OSW_UPLOAD_FORMATTING_REQUEST_WORKFLOW");
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
                            stage: OswStage.CONVERTING,
                            message: `${OswStage.CONVERTING} in progress`
                        })
                    ));
            const job = JobDTO.from(result.rows[0]);
            // Get the dataset details
            const dataset = await tdeiCoreService.getDatasetDetailsById(job.response_props.tdei_dataset_id);
            // update job with stage and updated date
            //Compose the meessage
            let queueMessage = QueueMessage.from({
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
            console.error(`Error while processing the ${this.eventName} for message type: ${message.messageType}`, error);
        }
    }
}