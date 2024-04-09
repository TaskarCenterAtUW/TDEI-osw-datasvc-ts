import { QueueMessage } from "nodets-ms-core/lib/core/queue";
import EventEmitter from "events";
import { WorkflowHandlerBase } from "../../../models/orchestrator-base-model";
import { IOrchestratorService } from "../../../services/orchestrator-service";
import { OswFormatJobResponse } from "../../../../model/job-request-response/osw-format-job-response";
import { JobStatus } from "../../../../model/jobs-get-query-params";
import dbClient from "../../../../database/data-source";
import { JobEntity } from "../../../../database/entity/job-entity";

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
            //Update job
            await dbClient.query(
                JobEntity.getUpdateQuery(
                    //Where clause
                    message.messageId,
                    //Column to update
                    JobEntity.from({
                        status: message.data.success ? JobStatus.COMPLETED : JobStatus.FAILED,
                        message: message.data.message,
                        download_url: response.formattedUrl
                    })
                ));
        } catch (error) {
            console.error(`Error while processing the ${this.eventName} for message type: ${message.messageType}`, error);
            return;
        }

        if (message.data.success)
            this.delegateWorkflowIfAny(delegate_worflow, message);
    }
}