import { environment } from "../../environment/environment";
import { Core } from "nodets-ms-core";
import { Topic } from "nodets-ms-core/lib/core/queue/topic";
import { QueueMessage } from "nodets-ms-core/lib/core/queue";
import { Workflow } from "../../model/orchestrator/config-model";

export class PublishUploadHandler {

    constructor() {
        Core.initialize();
    }

    handleWorkflow(workflow: Workflow, msg: QueueMessage) {
        switch (workflow.event) {
            case "VALIDATION_COMPLETED":
                //do job
                //publish to next event
                break;

            default:
                break;
        }
    }
}


const publishUploadHandler = new PublishUploadHandler();
export default publishUploadHandler;