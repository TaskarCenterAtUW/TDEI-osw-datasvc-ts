import { QueueMessage } from "nodets-ms-core/lib/core/queue";
import EventEmitter from "events";
import { WorkflowBase } from "../../models/orchestrator-base-model";
import { IOrchestratorService } from "../../services/orchestrator-service";
import { JobStatus } from "../../../model/jobs-get-query-params";
import dbClient from "../../../database/data-source";
import { JobEntity } from "../../../database/entity/job-entity";

export class DataQueryResponseWorkflow extends WorkflowBase {

    constructor(workflowEvent: EventEmitter, orchestratorServiceInstance: IOrchestratorService) {
        super(workflowEvent, orchestratorServiceInstance, "DATA_QUERY_RESPONSE_WORKFLOW");
    }

    async handleWorkflow(message: QueueMessage, params: any): Promise<void> {
        console.log(`Triggered ${this.eventName} :`, message.messageType);
        //do any pre-requisite task

        if (message.data.success) {
            this.delegateWorkflowHandlers(message);
        }
        else {
            await dbClient.query(
                JobEntity.getUpdateQuery(
                    //Where clause
                    message.messageId,
                    //Column to update
                    JobEntity.from({
                        message: message.data.message,
                        status: JobStatus.FAILED,
                    })
                ));
        }
    }
}