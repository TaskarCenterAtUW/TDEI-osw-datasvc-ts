/**
 * A request to convert station drawings into GTFS Pathways (pathways-converter job).
 * Exactly one of `datasetFile` (a zip of DXF files) or `arcgis_url` names the drawings.
 * The optional fields are passed through to the converter as given; see the
 * pathways-converter repo's docs/job-messages.md.
 */
export interface IConvertRequest {
    user_id: string;
    datasetFile?: any;
    arcgis_url?: string;
    layers?: string;
    crs?: string;
    control?: unknown;
    station?: string;
    level_pattern?: string;
    levels?: unknown;
    exclude_levels?: unknown;
    agency_gtfs_dataset_id?: string;
    parent_station?: string;
    platforms?: unknown;
    tdei_auth_token?: string;
    tdei_api_key?: string;
}
