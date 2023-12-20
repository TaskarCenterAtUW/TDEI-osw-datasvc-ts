import { PublishHandler } from "./generic/publish-handler";
import { PublishConfidenceResponseHandler } from "./publish/publish-osw-confidence-response-handler";
import { PublishConfidenceRequestWorkflow } from "./publish/publish-osw-confidence-request-workflow";
import { PublishConfidenceResponseWorkflow } from "./publish/publish-osw-confidence-response-workflow";
import { PublishFormattingResponseHandler } from "./publish/publish-osw-formatter-response-handler";
import { PublishFormattingRequestWorkflow } from "./publish/publish-osw-formatter-request-workflow";
import { PublishFormattingResponseWorkflow } from "./publish/publish-osw-formatter-response-workflow";
import { PublishValidationResponseHandler } from "./publish/publish-osw-validation-response-handler";
import { PublishValidationRequestWorkflow } from "./publish/publish-osw-validation-request-workflow";
import { PublishValidationResponseWorkflow } from "./publish/publish-osw-validation-response-workflow";
import { UploadValidationResponseHandler } from "./upload/upload-osw-validation-response-handler";
import { UploadValidationRequestWorkflow } from "./upload/upload-osw-validation-request-workflow";
import { UploadValidationResponseWorkflow } from "./upload/upload-osw-validation-response-workflow";
import { ValidationOnlyValidationResponseHandler } from "./validation-only/validation-only-osw-validation-response-handler";
import { ValidationOnlyValidationRequestWorkflow } from "./validation-only/validation-only-osw-validation-request-workflow";
import { ValidationOnlyValidationResponseWorkflow } from "./validation-only/validation-only-osw-validation-response-workflow";
import { PublishDatabaseWorkflow } from "./publish/publish-osw-database-publish-workflow";

export default [
    PublishHandler,
    PublishConfidenceResponseHandler,
    PublishConfidenceResponseWorkflow,
    PublishConfidenceRequestWorkflow,
    PublishFormattingResponseHandler,
    PublishFormattingRequestWorkflow,
    PublishFormattingResponseWorkflow,
    PublishValidationResponseHandler,
    PublishValidationRequestWorkflow,
    PublishValidationResponseWorkflow,
    UploadValidationResponseHandler,
    UploadValidationResponseWorkflow,
    UploadValidationRequestWorkflow,
    PublishConfidenceRequestWorkflow,
    ValidationOnlyValidationResponseHandler,
    ValidationOnlyValidationRequestWorkflow,
    ValidationOnlyValidationResponseWorkflow,
    PublishDatabaseWorkflow
];