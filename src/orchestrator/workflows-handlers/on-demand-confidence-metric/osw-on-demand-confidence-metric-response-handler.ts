import { QueueMessage } from "nodets-ms-core/lib/core/queue";
import appContext from "../../../app-context";
import EventEmitter from "events";
import { OSWConfidenceResponse } from "../../../model/osw-confidence-response";
import oswService from "../../../service/osw-service";
import { WorkflowHandlerBase } from "../../models/orchestrator-base";

export class OswOnDemandConfidenceResponseHandler extends WorkflowHandlerBase {

    constructor(workflowEvent: EventEmitter) {
        super(workflowEvent, "OSW_ON_DEMAND_CONFIDENCE_METRIC_RESPONSE_HANDLER");
    }

    /**
     * 
     * @param message 
     * @param delegate_worflow 
     * @param params 
     */
    override async handleRequest(message: QueueMessage, delegate_worflow: string[], params: any): Promise<void> {
        console.log("Triggered OSW_ON_DEMAND_CONFIDENCE_METRIC_RESPONSE_HANDLER :", message.messageType);

        try {
            const confidenceResponse = OSWConfidenceResponse.from(message.data)
            oswService.updateConfidenceMetric(confidenceResponse);
        } catch (error) {
            console.error("Error while processing the OSW_ON_DEMAND_CONFIDENCE_METRIC_RESPONSE_HANDLER ", error);
        }

        if (message.data.success)
            appContext.orchestratorServiceInstance!.delegateWorkflowIfAny(delegate_worflow, message);
    }
}