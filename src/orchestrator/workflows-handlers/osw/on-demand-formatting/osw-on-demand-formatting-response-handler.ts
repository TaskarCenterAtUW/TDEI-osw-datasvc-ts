import { QueueMessage } from "nodets-ms-core/lib/core/queue";
import EventEmitter from "events";
import { WorkflowHandlerBase } from "../../../models/orchestrator-base-model";
import { IOrchestratorService } from "../../../services/orchestrator-service";
import { OswFormatJobResponse } from "../../../../model/job-request-response/osw-format-job-response";
import { UpdateJobDTO } from "../../../../model/job-dto";
import { JobStatus } from "../../../../model/jobs-get-query-params";
import jobService from "../../../../service/job-service";

export class OswOnDemandFormattingResponseHandler extends WorkflowHandlerBase {

    constructor(workflowEvent: EventEmitter, orchestratorServiceInstance: IOrchestratorService) {
        super(workflowEvent, orchestratorServiceInstance, "OSW_ON_DEMAND_FORMATTING_RESPONSE_HANDLER");
    }

    /**
     * 
     * @param message 
     * @param delegate_worflow 
     * @param params 
     */
    async handleRequest(message: QueueMessage, delegate_worflow: string[], _params: any): Promise<void> {
        console.log(`Triggered ${this.eventName} :`, message.messageType);

        try {
            const response = OswFormatJobResponse.from(message.data);
            const updateJobDTO = UpdateJobDTO.from({
                job_id: message.messageId,
                message: response.message,
                status: response.success ? JobStatus.COMPLETED : JobStatus.FAILED,
                response_props: {
                    // download_url: response.formattedUrl
                },
                download_url: response.formattedUrl
            });
            await jobService.updateJob(updateJobDTO);
        } catch (error) {
            console.error(`Error while processing the ${this.eventName} for message type: ${message.messageType}`, error);
            return;
        }

        if (message.data.success)
            this.delegateWorkflowIfAny(delegate_worflow, message);
    }
}