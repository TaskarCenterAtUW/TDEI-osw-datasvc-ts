import { PublishHandler } from "./generic/publish-handler";
import { PublishConfidenceResponseHandler } from "./osw/publish/publish-osw-confidence-response-handler";
import { PublishConfidenceResponseWorkflow } from "./osw/publish/publish-osw-confidence-response-workflow";
import { UploadFormattingResponseHandler } from "./osw/upload/upload-osw-formatter-response-handler";
import { UploadFormattingRequestWorkflow } from "./osw/upload/upload-osw-formatter-request-workflow";
import { UploadFormattingResponseWorkflow } from "./osw/upload/upload-osw-formatter-response-workflow";
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
import { UploadValidationResponseWorkflow } from "./osw/upload/upload-osw-validation-response-workflow";
import { FlexUploadCompressionResponseHandler } from "./flex/upload/upload-flex-compression-response-handler";
import { UploadFlexCompressionRequestWorkflow } from "./flex/upload/upload-flex-compression-request-workflow";
import { UploadOswCompressionResponseHandler } from "./osw/upload/upload-osw-compression-response-handler";
import { UploadCompressionRequestWorkflow } from "./osw/upload/upload-osw-compression-request-workflow";
import { UploadCompressionOSMRequestWorkflow } from "./osw/upload/upload-osw-compression-osm-request-workflow";
import { UploadPathwaysCompressionRequestWorkflow } from "./pathways/upload/upload-pathways-compression-request-workflow";
import { PathwaysUploadCompressionResponseHandler } from "./pathways/upload/upload-pathways-compression-response-handler";

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
    UploadValidationResponseWorkflow,
    UploadCompressionRequestWorkflow,
    UploadOswCompressionResponseHandler,
    UploadCompressionOSMRequestWorkflow,
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
    FlexUploadCompressionResponseHandler,
    UploadFlexCompressionRequestWorkflow,
    //Pathways
    PathwaysPublishDatabaseWorkflow,
    PathwaysPublishValidationResponseHandler,
    PathwaysPublishValidationResponseWorkflow,
    PathwaysUploadValidationResponseHandler,
    PathwaysValidationOnlyValidationResponseHandler,
    UploadPathwaysCompressionRequestWorkflow,
    PathwaysUploadCompressionResponseHandler
];