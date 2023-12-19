import { QueueMessage } from "nodets-ms-core/lib/core/queue";
import appContext from "../../../server";
import { IWorkflowRegister } from "../../models/config-model";
import EventEmitter from "events";
import { OswValidationJobs } from "../../../database/entity/osw-validate-jobs";
import dbClient from "../../../database/data-source";

export class ValidationOnlyValidationHandler implements IWorkflowRegister {

    constructor(private workflowEvent: EventEmitter) {
    }

    register(): void {
        this.workflowEvent.on("OSW_VALIDATION_ONLY_VALIDATION_RESPONSE_HANDLER", this.handleMessage);
    }

    /**
     * 
     * @param message 
     * @param delegate_worflow 
     * @param params 
     */
    private async handleMessage(message: QueueMessage, delegate_worflow: string[], params: any) {
        console.log("Triggered OSW_VALIDATION_ONLY_VALIDATION_RESPONSE_HANDLER :", message.messageType);

        //Update the validation job table
        let job_id = message.messageId;
        let status = message.data.success ? "Validation Completed" : "Validation Failed";
        let response_message = message.data.message;

        let updateQuery = OswValidationJobs.getUpdateStatusQuery(job_id, status, response_message);

        const result = await dbClient.query(updateQuery);

        appContext.orchestratorServiceInstance.delegateWorkflowIfAny(delegate_worflow, message);
    }
}