import { QueueMessage } from "nodets-ms-core/lib/core/queue";
import EventEmitter from "events";
import { WorkflowHandlerBase } from "../../models/orchestrator-base-model";
import { IOrchestratorService } from "../../services/orchestrator-service";
import { BackendServiceJobResponse } from "../../../model/job-request-response/backend-service-job-response";
import jobService from "../../../service/job-service";
import { UpdateJobDTO } from "../../../model/job-dto";
import { JobStatus } from "../../../model/jobs-get-query-params";

export class BackendServiceResponseHandler extends WorkflowHandlerBase {

    constructor(workflowEvent: EventEmitter, orchestratorServiceInstance: IOrchestratorService) {
        super(workflowEvent, orchestratorServiceInstance, "BACKEND_SERVICE_RESPONSE_HANDLER");
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

            let updateJobDTO = UpdateJobDTO.from({
                job_id: message.messageId,
                message: backendServiceResponse.message,
                status: backendServiceResponse.success ? JobStatus.COMPLETED : JobStatus.FAILED,
                response_props: {
                },
                download_url: file_upload_path
            })
            await jobService.updateJob(updateJobDTO);
        } catch (error) {
            console.error(`Error while processing the ${this.eventName} `, error);
        }

        if (message.data.success)
            this.delegateWorkflowIfAny(delegate_worflow, message);
    }
}