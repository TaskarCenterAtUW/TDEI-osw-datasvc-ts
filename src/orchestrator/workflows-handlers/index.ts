import { PublishHandler } from "./generic/publish-handler";
import { PublishConfidenceResponseHandler } from "./osw/publish/publish-osw-confidence-response-handler";
import { PublishConfidenceRequestWorkflow } from "./osw/publish/publish-osw-confidence-request-workflow";
import { PublishConfidenceResponseWorkflow } from "./osw/publish/publish-osw-confidence-response-workflow";
import { PublishFormattingResponseHandler } from "./osw/publish/publish-osw-formatter-response-handler";
import { PublishFormattingRequestWorkflow } from "./osw/publish/publish-osw-formatter-request-workflow";
import { PublishFormattingResponseWorkflow } from "./osw/publish/publish-osw-formatter-response-workflow";
import { PublishValidationResponseHandler } from "./osw/publish/publish-osw-validation-response-handler";
import { PublishValidationResponseWorkflow } from "./osw/publish/publish-osw-validation-response-workflow";
import { UploadValidationResponseHandler } from "./osw/upload/upload-osw-validation-response-handler";
import { ValidationOnlyValidationResponseHandler } from "./osw/validation-only/validation-only-osw-validation-response-handler";
import { PublishDatabaseWorkflow } from "./osw/publish/publish-osw-database-publish-workflow";
import { OswOnDemandConfidenceResponseHandler } from "./osw/on-demand-confidence-metric/osw-on-demand-confidence-metric-response-handler";
import { OswOnDemandFormattingResponseHandler } from "./osw/on-demand-formatting/osw-on-demand-formatting-response-handler";
import { GenericWorkflow } from "./generic/generic-workflow";
import { PublishFlatteningRequestWorkflow } from "./osw/publish/publish-osw-flattening-request-workflow";
import { PublishFlatteningResponseWorkflow } from "./osw/publish/publish-osw-flattening-response-workflow";
import { PublishFlatteningResponseHandler } from "./osw/publish/publish-osw-flattening-response-handler";
import { OnDemandFlatteningResponseHandler } from "./on-demand-flattening/on-demand-flattening-response-handler";
import { BackendServiceResponseHandler } from "./backend-service/backend-service-response-handler";

export default [
    GenericWorkflow,
    PublishHandler,
    PublishConfidenceResponseHandler,
    PublishConfidenceResponseWorkflow,
    PublishConfidenceRequestWorkflow,
    PublishFormattingResponseHandler,
    PublishFormattingRequestWorkflow,
    PublishFormattingResponseWorkflow,
    PublishValidationResponseHandler,
    PublishValidationResponseWorkflow,
    PublishFlatteningRequestWorkflow,
    PublishFlatteningResponseWorkflow,
    PublishFlatteningResponseHandler,
    UploadValidationResponseHandler,
    ValidationOnlyValidationResponseHandler,
    PublishDatabaseWorkflow,
    OswOnDemandConfidenceResponseHandler,
    OswOnDemandFormattingResponseHandler,
    OnDemandFlatteningResponseHandler,
    BackendServiceResponseHandler
];