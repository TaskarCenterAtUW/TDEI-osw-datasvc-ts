import { QueueMessage } from "nodets-ms-core/lib/core/queue";
import EventEmitter from "events";
import { ConfidenceJobResponse } from "../../../../model/job-request-response/osw-confidence-job-response";
import { WorkflowHandlerBase } from "../../../models/orchestrator-base-model";
import { IOrchestratorService } from "../../../services/orchestrator-service";
import { JobDTO } from "../../../../model/job-dto";
import { JobStatus } from "../../../../model/jobs-get-query-params";
import tdeiCoreService from "../../../../service/tdei-core-service";
import dbClient from "../../../../database/data-source";
import { JobEntity } from "../../../../database/entity/job-entity";

export class OswOnDemandConfidenceResponseHandler extends WorkflowHandlerBase {

    constructor(workflowEvent: EventEmitter, orchestratorServiceInstance: IOrchestratorService) {
        super(workflowEvent, orchestratorServiceInstance, "OSW_ON_DEMAND_CONFIDENCE_METRIC_RESPONSE_HANDLER");
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
            const confidenceResponse = ConfidenceJobResponse.from(message.data);
            //Update job
            let result =
                await dbClient.query(
                    JobEntity.getUpdateQuery(
                        //Where clause
                        message.messageId,
                        //Column to update
                        JobEntity.from({
                            status: message.data.success ? JobStatus.COMPLETED : JobStatus.FAILED,
                            message: message.data.message,
                            response_props: {
                                confidence: confidenceResponse.confidence_level,
                                confidence_library_version: confidenceResponse.confidence_library_version
                            }
                        })
                    ));

            let updatedJob = JobDTO.from(result.rows[0]);

            tdeiCoreService.updateConfidenceMetric(updatedJob.request_input.tdei_dataset_id, confidenceResponse);
        } catch (error) {
            console.error(`Error while processing the ${this.eventName} for message type: ${message.messageType}`, error);
        }

        if (message.data.success)
            this.delegateWorkflowIfAny(delegate_worflow, message);
    }
}