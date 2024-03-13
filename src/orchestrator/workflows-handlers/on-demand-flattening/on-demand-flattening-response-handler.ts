import { QueueMessage } from "nodets-ms-core/lib/core/queue";
import EventEmitter from "events";
import oswService from "../../../service/osw-service";
import { WorkflowHandlerBase } from "../../models/orchestrator-base-model";
import { IOrchestratorService } from "../../services/orchestrator-service";
import { DataFlatteningJobResponse } from "../../../model/data-flattening-job-response";

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
            dataFlatteningJobResponse.ref_id = message.messageId;
            dataFlatteningJobResponse.status = message.data.success ? "COMPLETED" : "FAILED";
            oswService.updateDatasetFlatteningJob(dataFlatteningJobResponse);
        } catch (error) {
            console.error(`Error while processing the ${this.eventName} `, error);
        }

        if (message.data.success)
            this.delegateWorkflowIfAny(delegate_worflow, message);
    }
}