import EventEmitter from "events";
import { WorkflowHandlerBase } from "../../models/orchestrator-base-model";
import { IOrchestratorService } from "../../services/orchestrator-service";
import { QueueMessage } from "nodets-ms-core/lib/core/queue";
import dbClient from "../../../database/data-source";
import { JobEntity } from "../../../database/entity/job-entity";
import { JobDTO } from "../../../model/job-dto";
import { JobType } from "../../../model/jobs-get-query-params";
import { DatasetEntity } from "../../../database/entity/dataset-entity";
import { OswStage } from "../../../constants/app-constants";

export class DataQueryFormatterResponseHandler extends WorkflowHandlerBase {

    constructor(workflowEvent: EventEmitter, orchestratorServiceInstance: IOrchestratorService) {
        super(workflowEvent, orchestratorServiceInstance, "DATA_QUERY_FORMATTING_RESPONSE_HANDLER");
    }

    /**
     * 
     * @param message 
     * @param delegate_worflow 
     * @param params 
     */
    async handleRequest(message: QueueMessage, delegate_worflow: string[], params: any): Promise<void> {
        console.log(`Triggered ${this.eventName} :`, message.messageType);
        if (message.data.success) {

            let download_osm_url = message.data.formatted_url ?? "";

            try {
                download_osm_url = decodeURIComponent(download_osm_url!);

                //Update job
                let result = await dbClient.query(
                    JobEntity.getUpdateQuery(
                        //Where clause
                        message.messageId,
                        //Column to update
                        JobEntity.from({
                            stage: OswStage.CONVERTING,
                            message: `${OswStage.CONVERTING} completed`,
                            download_url: download_osm_url
                        })
                    ));
                const job = JobDTO.from(result.rows[0]);

                //If job type is dataset-queries then update the dataset entity with latest 
                //formatted url for Data manupulation queries
                if (job.job_type == JobType["Dataset-Queries"]) {
                    //Tag road dataset service request
                    if (job.request_input.service == "dataset_tag_road") {
                        await dbClient.query(DatasetEntity.getUpdateLatestOsmUrlQuery(job.request_input.parameters.target_dataset_id, download_osm_url));
                    }
                }

                this.delegateWorkflowIfAny(delegate_worflow, message);
            } catch (error) {
                console.error("Error updating the osw version formatting results", error);
                return;
            }
        }
    }
}