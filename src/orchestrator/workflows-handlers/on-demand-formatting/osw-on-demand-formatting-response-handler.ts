import { QueueMessage } from "nodets-ms-core/lib/core/queue";
import EventEmitter from "events";
import oswService from "../../../service/osw-service";
import { OswFormatJobResponse } from "../../../model/osw-format-job-response";
import { WorkflowHandlerBase } from "../../models/orchestrator-base-model";
import { IOrchestratorService } from "../../services/orchestrator-service";

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
    async handleRequest(message: QueueMessage, delegate_worflow: string[], params: any): Promise<void> {
        console.log(`Triggered ${this.eventName} :`, message.messageType);

        try {
            const response = OswFormatJobResponse.from(message.data);
            await oswService.updateOSWFormatJob(response);
        } catch (error) {
            console.error("Error while processing the OSW_ON_DEMAND_FORMATTING_RESPONSE_HANDLER ", error);
            return;
        }

        if (message.data.success)
            this.delegateWorkflowIfAny(delegate_worflow, message);
    }
}