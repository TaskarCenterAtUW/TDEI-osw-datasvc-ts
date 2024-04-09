import { QueueMessage } from "nodets-ms-core/lib/core/queue";
import EventEmitter from "events";
import { WorkflowHandlerBase } from "../../models/orchestrator-base-model";
import { IOrchestratorService } from "../../services/orchestrator-service";
import { BackendServiceJobResponse } from "../../../model/job-request-response/backend-service-job-response";
import dbClient from "../../../database/data-source";
import { JobEntity } from "../../../database/entity/job-entity";
import { JobDTO } from "../../../model/job-dto";
import { JobStatus, JobType } from "../../../model/jobs-get-query-params";
import { DatasetEntity } from "../../../database/entity/dataset-entity";
import { OswStage } from "../../../constants/app-constants";

export class DataQueryResponseHandler extends WorkflowHandlerBase {

    constructor(workflowEvent: EventEmitter, orchestratorServiceInstance: IOrchestratorService) {
        super(workflowEvent, orchestratorServiceInstance, "DATA_QUERY_RESPONSE_HANDLER");
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
            const backendServiceResponse = BackendServiceJobResponse.from(message.data);
            let file_upload_path = "";
            if (backendServiceResponse.file_upload_path != null && backendServiceResponse.file_upload_path != "" && backendServiceResponse.file_upload_path != undefined)
                file_upload_path = decodeURIComponent(backendServiceResponse.file_upload_path!);

            //Update job stage
            let result = await dbClient.query(
                JobEntity.getUpdateQuery(
                    //Where clause
                    message.messageId,
                    //Column to update
                    JobEntity.from({
                        stage: OswStage.DATASET_QUERY,
                        message: `${OswStage.DATASET_QUERY} completed`,
                        download_url: file_upload_path
                    })
                ));
            const job = JobDTO.from(result.rows[0]);

            //If job type is dataset-queries then update the dataset entity with latest 
            //formatted url for Data manupulation queries
            if (job.job_type == JobType["Dataset-Queries"]) {
                //Tag road dataset service DB manipulation request
                if (job.request_input.service == "dataset_tag_road") {
                    await dbClient.query(DatasetEntity.getUpdateLatestDatasetUrlQuery(job.request_input.parameters.target_dataset_id, file_upload_path));
                }
            }

            //Check if the file type is osm and trigger the conversion workflow
            if (job.request_input.file_type == "osm" || job.request_input.service == "dataset_tag_road") {
                this.delegateWorkflowIfAny(delegate_worflow, message);
            }
            else {
                await dbClient.query(
                    JobEntity.getUpdateQuery(
                        //Where clause
                        message.messageId,
                        //Column to update
                        JobEntity.from({
                            message: message.data.message,
                            status: JobStatus.COMPLETED,
                        })
                    ));
            }
        } catch (error) {
            console.error(`Error while processing the ${this.eventName} `, error);
        }


    }
}