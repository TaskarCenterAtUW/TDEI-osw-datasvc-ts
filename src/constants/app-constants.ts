export enum WorkflowName {
    "osw_upload" = "osw_upload_v2",
    "osw_publish" = "osw_publish",
    "osw_validation_only" = "osw_validation_only",
    "osw_confidence_on_demand" = "osw_confidence_on_demand",
    "osw_formatting_on_demand" = "osw_formatting_on_demand",
    "osw_dataset_road_tag" = "osw_dataset_road_tag",
    "osm_dataset_bbox" = "osm_dataset_bbox",
    "osw_dataset_bbox" = "osw_dataset_bbox",
    "flex_upload" = "flex_upload",
    "flex_publish" = "flex_publish",
    "flex_validation_only" = "flex_validation_only",
    "pathways_upload" = "pathways_upload",
    "pathways_publish" = "pathways_publish",
    "pathways_validation_only" = "pathways_validation_only",
    "osw_spatial_join" = "osw_spatial_join",
    "osw_quality_on_demand" = "osw_quality_metric_on_demand",
    "build_dataset_download" = "build_dataset_download",
    "build_osw_osm_dataset_download" = "build_osw_osm_dataset_download",
    "osw_dataset_incline_tag" = "osw_dataset_incline_tag",
    "osw_union_dataset" = "osw_union_dataset",
    "osw_generate_pmtiles" = "osw_generate_pmtiles"
}

export const JOBS_API_PATH = "/api/v1/jobs";

const DEFAULT_DATASET_UPLOAD_LIMIT_SIZE_BYTES = 1073741824; // 1 GB in bytes

const datasetUploadLimitFromEnv = Number(process.env.DATASET_UPLOAD_LIMIT_SIZE_BYTES);

export const DATASET_UPLOAD_LIMIT_SIZE_BYTES =
    Number.isFinite(datasetUploadLimitFromEnv) && datasetUploadLimitFromEnv > 0
        ? datasetUploadLimitFromEnv
        : DEFAULT_DATASET_UPLOAD_LIMIT_SIZE_BYTES;

//decimal (SI) units
const GB = 1_000_000_000;
const MB = 1_000_000;
const KB = 1_000;

function formatBytesForDisplay(bytes: number): string {
    if (bytes >= GB) {
        const gb = bytes / GB;
        return `${gb % 1 === 0 ? gb : gb.toFixed(1)} GB`;
    }
    if (bytes >= MB) {
        const mb = bytes / MB;
        return `${mb % 1 === 0 ? mb : mb.toFixed(1)} MB`;
    }
    if (bytes >= KB) {
        const kb = bytes / KB;
        return `${kb % 1 === 0 ? kb : kb.toFixed(1)} KB`;
    }
    return `${bytes} bytes`;
}

export const DATASET_UPLOAD_LIMIT_ERROR_MESSAGE =
    `The total size of dataset zip files exceeds ${formatBytesForDisplay(DATASET_UPLOAD_LIMIT_SIZE_BYTES)} upload limit.`;