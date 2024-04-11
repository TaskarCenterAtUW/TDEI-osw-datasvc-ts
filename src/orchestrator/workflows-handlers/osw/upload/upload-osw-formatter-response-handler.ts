import { QueueMessage } from "nodets-ms-core/lib/core/queue";
import EventEmitter from "events";
import { DatasetEntity } from "../../../../database/entity/dataset-entity";
import dbClient from "../../../../database/data-source";
import { WorkflowHandlerBase } from "../../../models/orchestrator-base-model";
import { IOrchestratorService } from "../../../services/orchestrator-service";
import { JobEntity } from "../../../../database/entity/job-entity";
import { JobDTO } from "../../../../model/job-dto";

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
    async handleRequest(message: QueueMessage, delegate_worflow: string[], _params: any): Promise<void> {
        console.log(`Triggered ${this.eventName} :`, message.messageType);
        if (message.data.success) {

            let download_osm_url = message.data.formatted_url ?? "";

            try {
                download_osm_url = decodeURIComponent(download_osm_url ?? "");
                const result = await dbClient.query(JobEntity.getJobByIdQuery(message.messageId));
                const job = JobDTO.from(result.rows[0]);
                //Update dataset with formatted url
                await dbClient.query(DatasetEntity.getUpdateFormatUrlQuery(job.response_props.tdei_dataset_id, download_osm_url));

                this.delegateWorkflowIfAny(delegate_worflow, message);
            } catch (error) {
                console.error("Error updating the osw version formatting results", error);
                return;
            }
        }
    }
}