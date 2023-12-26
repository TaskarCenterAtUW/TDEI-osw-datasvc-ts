import { QueueMessage } from "nodets-ms-core/lib/core/queue";
import appContext from "../../../app-context";
import { IWorkflowRegister } from "../../models/config-model";
import EventEmitter from "events";
import { OswValidationJobs } from "../../../database/entity/osw-validate-jobs";
import dbClient from "../../../database/data-source";
import oswService from "../../../service/Osw-service";
import { OswFormatJobResponse } from "../../../model/osw-format-job-response";

export class OswOnDemandFormattingResponseHandler implements IWorkflowRegister {

    constructor(private workflowEvent: EventEmitter) {
    }

    register(): void {
        this.workflowEvent.on("OSW_ON_DEMAND_FORMATTING_RESPONSE_HANDLER", this.handleMessage);
    }

    /**
     * 
     * @param message 
     * @param delegate_worflow 
     * @param params 
     */
    private async handleMessage(message: QueueMessage, delegate_worflow: string[], params: any) {
        console.log("Triggered OSW_ON_DEMAND_FORMATTING_RESPONSE_HANDLER :", message.messageType);

        try {
            const response = OswFormatJobResponse.from(message.data);
            await oswService.updateOSWFormatJob(response);
        } catch (error) {
            console.error("Error while processing the OSW_ON_DEMAND_FORMATTING_RESPONSE_HANDLER ", error);
            return;
        }

        if (message.data.success)
            appContext.orchestratorServiceInstance!.delegateWorkflowIfAny(delegate_worflow, message);
    }
}