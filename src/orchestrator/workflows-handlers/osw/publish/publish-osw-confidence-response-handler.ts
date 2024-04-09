import { QueueMessage } from "nodets-ms-core/lib/core/queue";
import EventEmitter from "events";
import { ConfidenceJobResponse } from "../../../../model/job-request-response/osw-confidence-job-response";
import dbClient from "../../../../database/data-source";
import { WorkflowHandlerBase } from "../../../models/orchestrator-base-model";
import { IOrchestratorService } from "../../../services/orchestrator-service";
import tdeiCoreService from "../../../../service/tdei-core-service";
import { JobEntity } from "../../../../database/entity/job-entity";
import { JobDTO } from "../../../../model/job-dto";
import { OswStage } from "../../../../constants/app-constants";

export class PublishConfidenceResponseHandler extends WorkflowHandlerBase {

    constructor(workflowEvent: EventEmitter, orchestratorServiceInstance: IOrchestratorService) {
        super(workflowEvent, orchestratorServiceInstance, "OSW_PUBLISH_CONFIDENCE_RESPONSE_HANDLER");
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
            try {
                const confidenceResponse = ConfidenceJobResponse.from(message.data);
                //Fetch the job details from the database
                const result = //Update job
                    await dbClient.query(
                        JobEntity.getUpdateQuery(
                            //Where clause
                            message.messageId,
                            //Column to update
                            JobEntity.from({
                                stage: OswStage.CONFIDENCE_METRIC,
                                message: `${OswStage.CONFIDENCE_METRIC} completed`
                            })
                        ));
                const job = JobDTO.from(result.rows[0]);
                //Update the confidence metric details
                tdeiCoreService.updateConfidenceMetric(job.request_input.tdei_dataset_id, confidenceResponse);

                this.delegateWorkflowIfAny(delegate_worflow, message);
            } catch (error) {
                console.error(`Error while processing the ${this.eventName} for message type: ${message.messageType}`, error);
                return;
            }
        }
    }
}