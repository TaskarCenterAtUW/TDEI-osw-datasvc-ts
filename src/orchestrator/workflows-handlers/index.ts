import { PublishHandler } from "./generic/publish-handler";
import { PublishConfidenceResponseHandler } from "./osw/publish/publish-osw-confidence-response-handler";
import { PublishConfidenceRequestWorkflow } from "./osw/publish/publish-osw-confidence-request-workflow";
import { PublishConfidenceResponseWorkflow } from "./osw/publish/publish-osw-confidence-response-workflow";
import { UploadFormattingResponseHandler } from "./osw/upload/upload-osw-formatter-response-handler";
import { UploadFormattingRequestWorkflow } from "./osw/upload/upload-osw-formatter-request-workflow";
import { UploadFormattingResponseWorkflow } from "./osw/upload/upload-osw-formatter-response-workflow";
import { PublishValidationResponseHandler } from "./osw/publish/publish-osw-validation-response-handler";
import { PublishValidationResponseWorkflow } from "./osw/publish/publish-osw-validation-response-workflow";
import { UploadValidationResponseHandler } from "./osw/upload/upload-osw-validation-response-handler";
import { ValidationOnlyValidationResponseHandler } from "./osw/validation-only/validation-only-osw-validation-response-handler";
import { PublishDatabaseWorkflow } from "./osw/publish/publish-osw-database-publish-workflow";
import { OswOnDemandConfidenceResponseHandler } from "./osw/on-demand-confidence-metric/osw-on-demand-confidence-metric-response-handler";
import { OswOnDemandFormattingResponseHandler } from "./osw/on-demand-formatting/osw-on-demand-formatting-response-handler";
import { GenericWorkflow } from "./generic/generic-workflow";
import { UploadFlatteningRequestWorkflow } from "./osw/upload/upload-osw-flattening-request-workflow";
import { UploadFlatteningResponseWorkflow } from "./osw/upload/upload-osw-flattening-response-workflow";
import { UploadFlatteningResponseHandler } from "./osw/upload/upload-osw-flattening-response-handler";
import { DataQueryResponseHandler } from "./backend-service/data-query-response-handler";
import { FlexPublishDatabaseWorkflow } from "./flex/publish/publish-flex-database-publish-workflow";
import { FlexPublishValidationResponseHandler } from "./flex/publish/publish-flex-validation-response-handler";
import { FlexPublishValidationResponseWorkflow } from "./flex/publish/publish-flex-validation-response-workflow";
import { FlexValidationOnlyValidationResponseHandler } from "./flex/validation-only/validation-only-flex-validation-response-handler";
import { FlexUploadValidationResponseHandler } from "./flex/upload/upload-flex-validation-response-handler";
import { PathwaysPublishDatabaseWorkflow } from "./pathways/publish/publish-pathways-database-publish-workflow";
import { PathwaysPublishValidationResponseHandler } from "./pathways/publish/publish-pathways-validation-response-handler";
import { PathwaysPublishValidationResponseWorkflow } from "./pathways/publish/publish-pathways-validation-response-workflow";
import { PathwaysUploadValidationResponseHandler } from "./pathways/upload/upload-pathways-validation-response-handler";
import { PathwaysValidationOnlyValidationResponseHandler } from "./pathways/validation-only/validation-only-pathways-validation-response-handler";
import { UploadDatabaseWorkflow } from "./osw/upload/upload-osw-database-publish-workflow";
import { DataQueryDatabaseWorkflow } from "./backend-service/data-query-database-publish-workflow";
import { DataQueryFormatterRequestWorkflow } from "./backend-service/data-query-formatter-request-workflow";
import { DataQueryFormatterResponseHandler } from "./backend-service/data-query-formatter-response-handler";
import { DataQueryFormatterResponseWorkflow } from "./backend-service/data-query-formatter-response-workflow";
import { DataQueryResponseWorkflow } from "./backend-service/data-query-response-workflow";

export default [
    GenericWorkflow,
    PublishHandler,
    //Data Query
    DataQueryResponseHandler,
    DataQueryDatabaseWorkflow,
    DataQueryFormatterRequestWorkflow,
    DataQueryFormatterResponseHandler,
    DataQueryFormatterResponseWorkflow,
    DataQueryResponseWorkflow,
    //Publish
    PublishConfidenceResponseHandler,
    PublishConfidenceResponseWorkflow,
    PublishConfidenceRequestWorkflow,
    PublishValidationResponseHandler,
    PublishValidationResponseWorkflow,
    PublishDatabaseWorkflow,
    //Upload
    UploadFormattingResponseHandler,
    UploadFormattingRequestWorkflow,
    UploadFormattingResponseWorkflow,
    UploadFlatteningRequestWorkflow,
    UploadFlatteningResponseWorkflow,
    UploadFlatteningResponseHandler,
    UploadValidationResponseHandler,
    UploadDatabaseWorkflow,
    //Validation Only
    ValidationOnlyValidationResponseHandler,
    //On Demand Confidence
    OswOnDemandConfidenceResponseHandler,
    //On Demand Formatting
    OswOnDemandFormattingResponseHandler,
    //Flex
    FlexPublishDatabaseWorkflow,
    FlexPublishValidationResponseHandler,
    FlexPublishValidationResponseWorkflow,
    FlexValidationOnlyValidationResponseHandler,
    FlexUploadValidationResponseHandler,
    //Pathways
    PathwaysPublishDatabaseWorkflow,
    PathwaysPublishValidationResponseHandler,
    PathwaysPublishValidationResponseWorkflow,
    PathwaysUploadValidationResponseHandler,
    PathwaysValidationOnlyValidationResponseHandler
];