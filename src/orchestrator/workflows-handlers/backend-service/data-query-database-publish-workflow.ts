import { QueueMessage } from "nodets-ms-core/lib/core/queue";
import EventEmitter from "events";
import { WorkflowBase } from "../../models/orchestrator-base-model";
import { IOrchestratorService } from "../../services/orchestrator-service";
import { UpdateJobDTO } from "../../../model/job-dto";
import { JobStatus } from "../../../model/jobs-get-query-params";
import jobService from "../../../service/job-service";

export class DataQueryDatabaseWorkflow extends WorkflowBase {

    constructor(workflowEvent: EventEmitter, orchestratorServiceInstance: IOrchestratorService) {
        super(workflowEvent, orchestratorServiceInstance, "DATA_QUERY_DATABASE_WORKFLOW");
    }

    async handleWorkflow(message: QueueMessage, params: any): Promise<void> {
        console.log(`Triggered ${this.eventName} :`, message.messageType);
        try {
            let updateJobDTO = UpdateJobDTO.from({
                job_id: message.messageId,
                message: "Request Processed Successfully",
                status: JobStatus.COMPLETED,
                response_props: {}
            })
            await jobService.updateJob(updateJobDTO);
        }
        catch (error) {
            console.error("Error in updating the data query details to the database", error);
        }
        this.delegateWorkflowHandlers(message);
    }
}