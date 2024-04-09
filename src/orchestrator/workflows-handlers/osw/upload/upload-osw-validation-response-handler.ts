import EventEmitter from "events";
import { WorkflowHandlerBase } from "../../../models/orchestrator-base-model";
import { IOrchestratorService } from "../../../services/orchestrator-service";
import { QueueMessage } from "nodets-ms-core/lib/core/queue";
import dbClient from "../../../../database/data-source";
import { JobEntity } from "../../../../database/entity/job-entity";
import { OswStage } from "../../../../constants/app-constants";

export class UploadValidationResponseHandler extends WorkflowHandlerBase {

    constructor(workflowEvent: EventEmitter, orchestratorServiceInstance: IOrchestratorService) {
        super(workflowEvent, orchestratorServiceInstance, "OSW_UPLOAD_VALIDATION_RESPONSE_HANDLER");
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
                //Update job stage
                await dbClient.query(
                    JobEntity.getUpdateQuery(
                        //Where clause
                        message.messageId,
                        //Column to update
                        JobEntity.from({
                            stage: OswStage.VALIDATION,
                            message: `${OswStage.VALIDATION} completed`
                        })
                    ));

                this.delegateWorkflowIfAny(delegate_worflow, message);
            } catch (error) {
                console.error(`Error while processing the ${this.eventName} for message type: ${message.messageType}`, error);
                return;
            }
        }
    }
} 