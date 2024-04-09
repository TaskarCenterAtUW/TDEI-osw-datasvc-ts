import { QueueMessage } from "nodets-ms-core/lib/core/queue";
import EventEmitter from "events";
import { DatasetEntity } from "../../../../database/entity/dataset-entity";
import dbClient from "../../../../database/data-source";
import { WorkflowHandlerBase } from "../../../models/orchestrator-base-model";
import { IOrchestratorService } from "../../../services/orchestrator-service";
import { JobEntity } from "../../../../database/entity/job-entity";
import { JobDTO } from "../../../../model/job-dto";
import { OswStage } from "../../../../constants/app-constants";

export class UploadFormattingResponseHandler extends WorkflowHandlerBase {

    constructor(workflowEvent: EventEmitter, orchestratorServiceInstance: IOrchestratorService) {
        super(workflowEvent, orchestratorServiceInstance, "OSW_UPLOAD_FORMATTING_RESPONSE_HANDLER");
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
                const result = //Update job
                    await dbClient.query(
                        JobEntity.getUpdateQuery(
                            //Where clause
                            message.messageId,
                            //Column to update
                            JobEntity.from({
                                stage: OswStage.CONVERTING,
                                message: `${OswStage.CONVERTING} completed`
                            })
                        ));

                const job = JobDTO.from(result.rows[0]);
                //Update dataset with formatted url
                await dbClient.query(DatasetEntity.getUpdateFormatUrlQuery(job.response_props.tdei_dataset_id, download_osm_url));

                this.delegateWorkflowIfAny(delegate_worflow, message);
            } catch (error) {
                console.error(`Error while processing the ${this.eventName} for message type: ${message.messageType}`, error);
                return;
            }
        }
    }
}