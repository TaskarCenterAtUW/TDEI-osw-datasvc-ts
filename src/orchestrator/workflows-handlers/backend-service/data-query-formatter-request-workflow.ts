import { QueueMessage } from "nodets-ms-core/lib/core/queue";
import EventEmitter from "events";
import { WorkflowBase } from "../../models/orchestrator-base-model";
import { IOrchestratorService } from "../../services/orchestrator-service";
import tdeiCoreService from "../../../service/tdei-core-service";
import dbClient from "../../../database/data-source";
import { JobEntity } from "../../../database/entity/job-entity";
import { JobDTO } from "../../../model/job-dto";
import { JobType } from "../../../model/jobs-get-query-params";

export class DataQueryFormatterRequestWorkflow extends WorkflowBase {

    constructor(workflowEvent: EventEmitter, orchestratorServiceInstance: IOrchestratorService) {
        super(workflowEvent, orchestratorServiceInstance, "DATA_QUERY_FORMATTING_REQUEST_WORKFLOW");
    }

    async handleWorkflow(message: QueueMessage, params: any): Promise<void> {
        console.log(`Triggered ${this.eventName} :`, message.messageType);

        try {
            //Get the job details from the database
            const result = await dbClient.query(JobEntity.getJobByIdQuery(message.messageId));
            const job = JobDTO.from(result.rows[0]);

            var tdei_dataset_id;
            if (job.job_type == JobType["Dataset-Road-Tag"] || job.job_type == JobType["Dataset-BBox"]) {
                //Tag road dataset service DB manipulation request
                if (job.request_input.service == "dataset_tag_road") {
                    tdei_dataset_id = job.request_input.parameters.target_dataset_id
                }
                else if (job.request_input.service == "bbox_intersect") {
                    tdei_dataset_id = job.request_input.parameters.tdei_dataset_id
                }
            }

            // Get the dataset details
            const dataset = await tdeiCoreService.getDatasetDetailsById(tdei_dataset_id);

            //Compose the meessage
            let queueMessage = QueueMessage.from({
                messageId: message.messageId,
                messageType: `${this.eventName}`, // will be set by the publish handler with params defined in config
                data: {
                    file_upload_path: dataset.latest_dataset_url,
                    tdei_project_group_id: dataset.tdei_project_group_id
                }
            });

            //trigger handlers
            this.delegateWorkflowHandlers(queueMessage);
        }
        catch (error) {
            console.error("Error in handling the dataset formatting request workflow", error);
        }
    }
}