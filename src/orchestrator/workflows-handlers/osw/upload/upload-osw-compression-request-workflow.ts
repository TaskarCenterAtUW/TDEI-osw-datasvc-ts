
import { EventEmitter } from "events";
import { QueueMessage } from "nodets-ms-core/lib/core/queue";
import { WorkflowBase } from "../../../models/orchestrator-base-model";
import { IOrchestratorService } from "../../../services/orchestrator-service";
import tdeiCoreService from "../../../../service/tdei-core-service";
import dbClient from "../../../../database/data-source";
import { JobEntity } from "../../../../database/entity/job-entity";
import { JobDTO } from "../../../../model/job-dto";
import path from "path";

export class UploadCompressionRequestWorkflow extends WorkflowBase {

    constructor(workflowEvent: EventEmitter, orchestratorServiceInstance: IOrchestratorService) {
        super(workflowEvent, orchestratorServiceInstance, "OSW_UPLOAD_COMPRESSION_REQUEST_WORKFLOW");
    }

    async handleWorkflow(message: QueueMessage, params: any): Promise<void> {
        console.log(`Triggered ${this.eventName} :`, message.messageType);

        try {
            //Get the job details from the database
            const result = await dbClient.query(JobEntity.getJobByIdQuery(message.messageId));
            const job = JobDTO.from(result.rows[0]);
            // Get the dataset details
            const dataset = await tdeiCoreService.getDatasetDetailsById(job.response_props.tdei_dataset_id);
            let input_urls = [dataset.latest_dataset_url, dataset.metadata_url];
            if (dataset.changeset_url && dataset.changeset_url != "" && dataset.changeset_url != null) {
                input_urls.push(dataset.changeset_url);
            }
            let directory = path.dirname(dataset.latest_dataset_url);
            console.log('directory ',directory);
            let output_path = directory + '/zip/'+dataset.tdei_dataset_id+'.zip';
            console.log('output path ',output_path);
            //Compose the meessage
            let queueMessage = QueueMessage.from({
                messageId: message.messageId,
                messageType: `${this.eventName}`, //will be set by the publish handler with params defined in config
                data: {
                    isOsm: false,
                    input_urls: input_urls, // osw.zip, metada.json, 
                    output_path: output_path // <>/zip/dataset_id.zip
                }
            });

            //trigger handlers
            this.delegateWorkflowHandlers(queueMessage);
        }
        catch (error) {
            console.error("Error in handling the compression request workflow", error);
        }
    }
}