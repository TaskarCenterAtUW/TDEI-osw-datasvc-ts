import { EventEmitter } from "events";
import { WorkflowBase } from "../../../models/orchestrator-base-model";
import { IOrchestratorService } from "../../../services/orchestrator-service";
import tdeiCoreService from "../../../../service/tdei-core-service";
import dbClient from "../../../../database/data-source";
import { JobEntity } from "../../../../database/entity/job-entity";
import { JobDTO } from "../../../../model/job-dto";
import { QueueMessage } from "nodets-ms-core/lib/core/queue";
import path from "path";


export class UploadPathwaysCompressionRequestWorkflow extends WorkflowBase {

    constructor(workflowEvent: EventEmitter, orchestratorServiceInstance: IOrchestratorService) {
        super(workflowEvent, orchestratorServiceInstance, "PATHWAYS_UPLOAD_COMPRESSION_REQUEST_WORKFLOW");
    }

    async handleWorkflow(message: QueueMessage, params: any): Promise<void> {
        console.log(`Triggered ${this.eventName} :`, message.messageType);

        try {
            console.log('Triggered message');
            const result = await dbClient.query(JobEntity.getJobByIdQuery(message.messageId));
            const job = JobDTO.from(result.rows[0]);
            const dataset = await tdeiCoreService.getDatasetDetailsById(job.response_props.tdei_dataset_id);
            const input_urls = [dataset.latest_dataset_url, dataset.metadata_url]
            if (dataset.changeset_url && dataset.changeset_url != "" && dataset.changeset_url != null)
                input_urls.push(dataset.changeset_url);
            // get the directory of the dataset
            const directory = path.dirname(dataset.latest_dataset_url);
            console.log('directory ',directory);
            const output_path = directory + '/zip/'+dataset.tdei_dataset_id+'.zip';
            console.log('output path ',output_path);
            const queueMessage = QueueMessage.from({
                messageId: message.messageId,
                messageType: `${this.eventName}`,
                data: {
                     input_urls: input_urls,
                     output_path: output_path
                }
            });
            console.log('queue message ',queueMessage);
            // //trigger handlers
            this.delegateWorkflowHandlers(queueMessage);
        }
        catch (error) {
            console.error("Error in handling the compression request workflow", error);
        }
    }
}