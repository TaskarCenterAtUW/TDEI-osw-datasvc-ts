import { QueueMessage } from "nodets-ms-core/lib/core/queue";
import EventEmitter from "events";
import { WorkflowBase } from "../../../models/orchestrator-base-model";
import { IOrchestratorService } from "../../../services/orchestrator-service";
import tdeiCoreService from "../../../../service/tdei-core-service";
import dbClient from "../../../../database/data-source";
import { JobEntity } from "../../../../database/entity/job-entity";
import { JobDTO } from "../../../../model/job-dto";
import { OswStage } from "../../../../constants/app-constants";

export class UploadFlatteningRequestWorkflow extends WorkflowBase {

    constructor(workflowEvent: EventEmitter, orchestratorServiceInstance: IOrchestratorService) {
        super(workflowEvent, orchestratorServiceInstance, "OSW_UPLOAD_DATASET_FLATTENING_REQUEST_WORKFLOW");
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
                            stage: OswStage.FLATTENING,
                            message: `${OswStage.FLATTENING} in progress`
                        })
                    ));
            const job = JobDTO.from(result.rows[0]);
            // Get the dataset details
            const dataset = await tdeiCoreService.getDatasetDetailsById(job.response_props.tdei_dataset_id);

            //Compose the meessage
            let queueMessage = QueueMessage.from({
                messageId: message.messageId,
                messageType: `${this.eventName}`, // will be set by the publish handler with params defined in config
                data: {
                    tdei_dataset_id: job.response_props.tdei_dataset_id,
                    file_upload_path: dataset.dataset_url,
                    data_type: "osw"
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