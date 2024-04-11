import { QueueMessage } from "nodets-ms-core/lib/core/queue";
import EventEmitter from "events";
import { WorkflowBase } from "../../models/orchestrator-base-model";
import { IOrchestratorService } from "../../services/orchestrator-service";
import { UpdateJobDTO } from "../../../model/job-dto";
import { JobStatus } from "../../../model/jobs-get-query-params";
import jobService from "../../../service/job-service";

export class DataQueryResponseWorkflow extends WorkflowBase {

    constructor(workflowEvent: EventEmitter, orchestratorServiceInstance: IOrchestratorService) {
        super(workflowEvent, orchestratorServiceInstance, "DATA_QUERY_RESPONSE_WORKFLOW");
    }

    async handleWorkflow(message: QueueMessage, _params: any): Promise<void> {
        console.log(`Triggered ${this.eventName} :`, message.messageType);
        //do any pre-requisite task

        if (message.data.success) {
            this.delegateWorkflowHandlers(message);
        }
        else {
            const updateJobDTO = UpdateJobDTO.from({
                job_id: message.messageId,
                message: message.data.message,
                status: JobStatus.FAILED,
                response_props: {}
            })
            await jobService.updateJob(updateJobDTO);
        }
    }
}