import { QueueMessage } from "nodets-ms-core/lib/core/queue";
import EventEmitter from "events";
import { OswValidationJobs } from "../../../database/entity/osw-validate-jobs";
import dbClient from "../../../database/data-source";
import { WorkflowHandlerBase } from "../../models/orchestrator-base-model";
import { IOrchestratorService } from "../../services/orchestrator-service";

export class ValidationOnlyValidationResponseHandler extends WorkflowHandlerBase {

    constructor(workflowEvent: EventEmitter, orchestratorServiceInstance: IOrchestratorService) {
        super(workflowEvent, orchestratorServiceInstance, "OSW_VALIDATION_ONLY_VALIDATION_RESPONSE_HANDLER");
    }

    /**
     * 
     * @param message 
     * @param delegate_worflow 
     * @param params 
     */
    async handleRequest(message: QueueMessage, delegate_worflow: string[], params: any): Promise<void> {
        console.log(`Triggered ${this.eventName} :`, message.messageType);

        if (message.data.success) {
            try {
                //Update the validation job table
                let job_id = message.messageId;
                let status = message.data.success ? "Validation Completed" : "Validation Failed";
                let response_message = message.data.message;

                let updateQuery = OswValidationJobs.getUpdateStatusQuery(job_id, status, response_message);

                await dbClient.query(updateQuery);

                this.delegateWorkflowIfAny(delegate_worflow, message);

            } catch (error) {
                console.error("Error while processing the OSW_VALIDATION_ONLY_VALIDATION_RESPONSE_HANDLER ", error)
            }
        }
    }
}