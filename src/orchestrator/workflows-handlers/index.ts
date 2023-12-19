import { PublishHandler } from "./generic/publish-handler";
import { PublishConfidenceHandler } from "./publish/publish-osw-confidence-handler";
import { PublishConfidenceRequestWorkflow } from "./publish/publish-osw-confidence-request-workflow";
import { PublishConfidenceWorkflow } from "./publish/publish-osw-confidence-workflow";
import { PublishFormattingHandler } from "./publish/publish-osw-formatter-handler";
import { PublishFormattingRequestWorkflow } from "./publish/publish-osw-formatter-request-workflow";
import { PublishFormattingWorkflow } from "./publish/publish-osw-formatter-workflow";
import { PublishValidationHandler } from "./publish/publish-osw-validation-handler";
import { PublishValidationRequestWorkflow } from "./publish/publish-osw-validation-request-workflow";
import { PublishValidationWorkflow } from "./publish/publish-osw-validation-workflow";
import { UploadValidationHandler } from "./upload/upload-osw-validation-handler";
import { UploadValidationRequestWorkflow } from "./upload/upload-osw-validation-request-workflow";
import { UploadValidationWorkflow } from "./upload/upload-osw-validation-workflow";

export default [
    PublishHandler,
    PublishConfidenceHandler,
    PublishConfidenceWorkflow,
    PublishConfidenceRequestWorkflow,
    PublishFormattingHandler,
    PublishFormattingRequestWorkflow,
    PublishFormattingWorkflow,
    PublishValidationHandler,
    PublishValidationRequestWorkflow,
    PublishValidationWorkflow,
    UploadValidationHandler,
    UploadValidationWorkflow,
    UploadValidationRequestWorkflow,
];