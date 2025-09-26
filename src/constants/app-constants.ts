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

export const ONE_GB_IN_BYTES = 1073741824;