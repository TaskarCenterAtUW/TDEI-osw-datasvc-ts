import { QueueMessage } from "nodets-ms-core/lib/core/queue";
import EventEmitter from "events";
import { WorkflowHandlerBase } from "../../../models/orchestrator-base-model";
import { IOrchestratorService } from "../../../services/orchestrator-service";
import { JobStatus } from "../../../../model/jobs-get-query-params";
import dbClient from "../../../../database/data-source";
import { JobEntity } from "../../../../database/entity/job-entity";

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
        try {
            await dbClient.query(
                JobEntity.getUpdateQuery(
                    //Where clause
                    message.messageId,
                    //Column to update
                    JobEntity.from({
                        message: message.data.message,
                        status: message.data.success ? JobStatus.COMPLETED : JobStatus.FAILED,
                    })
                ));

            this.delegateWorkflowIfAny(delegate_worflow, message);

        } catch (error) {
            console.error(`Error while processing the ${this.eventName} for message type: ${message.messageType}`, error);
        }
    }
}