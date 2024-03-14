import { QueueMessage } from "nodets-ms-core/lib/core/queue";
import EventEmitter from "events";
import oswService from "../../../service/osw-service";
import { WorkflowHandlerBase } from "../../models/orchestrator-base-model";
import { IOrchestratorService } from "../../services/orchestrator-service";
import { DataFlatteningJobResponse } from "../../../model/job-request-response/data-flattening-job-response";
import { UpdateJobDTO } from "../../../model/job-dto";
import { JobStatus } from "../../../model/jobs-get-query-params";
import jobService from "../../../service/job-service";

export class OnDemandFlatteningResponseHandler extends WorkflowHandlerBase {

    constructor(workflowEvent: EventEmitter, orchestratorServiceInstance: IOrchestratorService) {
        super(workflowEvent, orchestratorServiceInstance, "ON_DEMAND_DATASET_FLATTENING_RESPONSE_HANDLER");
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
            const dataFlatteningJobResponse = DataFlatteningJobResponse.from(message.data);

            let updateJobDTO = UpdateJobDTO.from({
                job_id: message.messageId,
                message: dataFlatteningJobResponse.message,
                status: dataFlatteningJobResponse.success ? JobStatus.COMPLETED : JobStatus.FAILED,
                response_props: {
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