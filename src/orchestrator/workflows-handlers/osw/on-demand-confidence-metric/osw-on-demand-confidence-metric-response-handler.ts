import { QueueMessage } from "nodets-ms-core/lib/core/queue";
import EventEmitter from "events";
import { ConfidenceJobResponse } from "../../../../model/job-request-response/osw-confidence-job-response";
import { WorkflowHandlerBase } from "../../../models/orchestrator-base-model";
import { IOrchestratorService } from "../../../services/orchestrator-service";
import jobService from "../../../../service/job-service";
import { UpdateJobDTO } from "../../../../model/job-dto";
import { JobStatus } from "../../../../model/jobs-get-query-params";
import tdeiCoreService from "../../../../service/tdei-core-service";

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
            let updateJobDTO = UpdateJobDTO.from({
                job_id: message.messageId,
                message: confidenceResponse.message,
                status: confidenceResponse.success ? JobStatus.COMPLETED : JobStatus.FAILED,
                response_props: {
                    confidence_scores: confidenceResponse.confidence_scores ?? {},
                    confidence_library_version: confidenceResponse.confidence_library_version
                }
            })
            await jobService.updateJob(updateJobDTO);
        } catch (error) {
            console.error(`Error while processing the ${this.eventName} for message type: ${message.messageType}`, error);
        }

        if (message.data.success)
            this.delegateWorkflowIfAny(delegate_worflow, message);
    }
}