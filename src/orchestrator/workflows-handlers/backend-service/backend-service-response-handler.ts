import { QueueMessage } from "nodets-ms-core/lib/core/queue";
import EventEmitter from "events";
import oswService from "../../../service/osw-service";
import { WorkflowHandlerBase } from "../../models/orchestrator-base-model";
import { IOrchestratorService } from "../../services/orchestrator-service";
import { BackendServiceJobResponse } from "../../../model/backend-service-job-response";

export class OnBackendServiceResponseHandler extends WorkflowHandlerBase {

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
            backendServiceResponse.file_upload_path = decodeURIComponent(backendServiceResponse.file_upload_path!);
            backendServiceResponse.job_id = message.messageId;
            backendServiceResponse.status = message.data.success ? "COMPLETED" : "FAILED";
            oswService.updateBackendServiceJob(backendServiceResponse);
        } catch (error) {
            console.error(`Error while processing the ${this.eventName} `, error);
        }

        if (message.data.success)
            this.delegateWorkflowIfAny(delegate_worflow, message);
    }
}