import EventEmitter from "events";
import { WorkflowHandlerBase } from "../../../models/orchestrator-base-model";
import { IOrchestratorService } from "../../../services/orchestrator-service";

export class UploadValidationResponseHandler extends WorkflowHandlerBase {

    constructor(workflowEvent: EventEmitter, orchestratorServiceInstance: IOrchestratorService) {
        super(workflowEvent, orchestratorServiceInstance, "OSW_UPLOAD_VALIDATION_RESPONSE_HANDLER");
    }
    // write code for conversion stage
}

// upload
// - goes to validation  -> stages ?? -> validation started
// - receives validation response  -> stage ?? -> validation completed
// - goes to formatter -> stage -> converting started
// - receives formatter response -> stage -> converting completed
// - goes for flattening -> stage -> flattening started
// - receives from flattening -> stage -> flattening completed