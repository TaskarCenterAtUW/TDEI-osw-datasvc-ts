import { QueueMessage } from "nodets-ms-core/lib/core/queue";
import appContext from "../../../app-context";
import { IWorkflowRegister } from "../../models/config-model";
import EventEmitter from "events";
import { OSWConfidenceResponse } from "../../../model/osw-confidence-response";
import oswService from "../../../service/osw-service";

export class OswOnDemandConfidenceResponseHandler implements IWorkflowRegister {

    constructor(private workflowEvent: EventEmitter) {
    }

    register(): void {
        this.workflowEvent.on("OSW_ON_DEMAND_CONFIDENCE_METRIC_RESPONSE_HANDLER", this.handleMessage);
    }

    /**
     * 
     * @param message 
     * @param delegate_worflow 
     * @param params 
     */
    private async handleMessage(message: QueueMessage, delegate_worflow: string[], params: any) {
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