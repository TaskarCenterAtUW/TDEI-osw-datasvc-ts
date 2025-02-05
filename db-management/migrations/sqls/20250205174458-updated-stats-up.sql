-- UPDATE FUNCTION "content".tdei_fetch_data_metrics();

CREATE OR REPLACE FUNCTION content.tdei_fetch_data_metrics()
 RETURNS json
 LANGUAGE plpgsql
AS $function$
DECLARE
    result JSON;
BEGIN
    WITH
        osw_dataset_edges_cte AS (
            SELECT
                SUM(num_edges) AS num_edges,
                ROUND(CAST((SUM(length_of_sidewalks_mtr) / 1000) AS numeric), 2) AS length_of_sidewalks_km,
                SUM(num_crossings) AS num_crossings,
                SUM(num_nodes) AS num_nodes,
                SUM(area_km2) AS area_km2
            FROM content.osw_stats os
            INNER JOIN content.dataset ds
                ON os.tdei_dataset_id = ds.tdei_dataset_id
            WHERE ds.status NOT IN ('Deleted', 'Draft')
        ),
        datset_metric_cte AS (
            SELECT
                SUM(CASE WHEN data_type = 'osw' THEN 1 ELSE 0 END) AS osw_totalDatasets,
                SUM(CASE WHEN data_type = 'flex' THEN 1 ELSE 0 END) AS flex_totalDatasets,
                SUM(CASE WHEN data_type = 'pathways' THEN 1 ELSE 0 END) AS pathways_totalDatasets,
                SUM(CASE WHEN data_type = 'osw' THEN upload_file_size_bytes ELSE 0 END) AS osw_totalSizeByt,
                SUM(CASE WHEN data_type = 'flex' THEN upload_file_size_bytes ELSE 0 END) AS flex_totalSizeByt,
                SUM(CASE WHEN data_type = 'pathways' THEN upload_file_size_bytes ELSE 0 END) AS pathways_totalSizeByt
            FROM content.dataset
            WHERE status NOT IN ('Deleted', 'Draft')
        ),
        download_stats_cte AS (
            -- First, get the API usage rows for the three endpoints.
            -- Then, for each row, use a subquery to fetch the summed file_size from download_stats
            SELECT
                SUM(CASE WHEN endpoint = '/api/v1/osw/:id' THEN 1 ELSE 0 END) AS osw_totalDownloadDatasets,
                SUM(CASE WHEN endpoint = '/api/v1/osw/:id' THEN COALESCE(download_size, 0) ELSE 0 END) AS osw_totalDownloadSizeByt,
                SUM(CASE WHEN endpoint = '/api/v1/gtfs-flex/:id' THEN 1 ELSE 0 END) AS flex_totalDownloadDatasets,
                SUM(CASE WHEN endpoint = '/api/v1/gtfs-flex/:id' THEN COALESCE(download_size, 0) ELSE 0 END) AS flex_totalDownloadSizeByt,
                SUM(CASE WHEN endpoint = '/api/v1/gtfs-pathways/:id' THEN 1 ELSE 0 END) AS pathways_totalDownloadDatasets,
                SUM(CASE WHEN endpoint = '/api/v1/gtfs-pathways/:id' THEN COALESCE(download_size, 0) ELSE 0 END) AS pathways_totalDownloadSizeByt
            FROM (
                SELECT
                    aud.endpoint,
                    -- For each API usage row, sum the file_size from download_stats where the IDs match.
                    (
                      SELECT SUM(ds.file_size)
                      FROM content.download_stats ds
                      WHERE ds.tdei_dataset_id = aud.request_params->>'id'
                    ) AS download_size
                FROM content.api_usage_details aud
                WHERE aud.endpoint IN ('/api/v1/osw/:id', '/api/v1/gtfs-flex/:id', '/api/v1/gtfs-pathways/:id')
            ) sub
        )
    SELECT json_build_object(
        'dataMetrics', json_build_object(
            'datasetByType', json_build_object(
                'osw', json_build_object(
                    'totalDatasets', dmc.osw_totalDatasets,
                    'totalSizeMB', ROUND(dmc.osw_totalSizeByt / 1048576.0, 2),
                    'totalDownloadDatasets', dsc.osw_totalDownloadDatasets,
                    'totalDownloadSizeMB', ROUND(dsc.osw_totalDownloadSizeByt / 1048576.0, 2),
                    'aggregatedStats', json_build_object(
                        'num_crossings', odec.num_crossings,
                        'length_of_sidewalks_km', odec.length_of_sidewalks_km,
                        'num_edges', odec.num_edges,
                        'num_nodes', odec.num_nodes,
                        'area_km2', ROUND(CAST(odec.area_km2 AS DECIMAL), 2)
                    )
                ),
                'flex', json_build_object(
                    'totalDatasets', dmc.flex_totalDatasets,
                    'totalSizeMB', ROUND(dmc.flex_totalSizeByt / 1048576.0, 2),
                    'totalDownloadDatasets', dsc.flex_totalDownloadDatasets,
                    'totalDownloadSizeMB', ROUND(dsc.flex_totalDownloadSizeByt / 1048576.0, 2)
                ),
                'pathways', json_build_object(
                    'totalDatasets', dmc.pathways_totalDatasets,
                    'totalSizeMB', ROUND(dmc.pathways_totalSizeByt / 1048576.0, 2),
                    'totalDownloadDatasets', dsc.pathways_totalDownloadDatasets,
                    'totalDownloadSizeMB', ROUND(dsc.pathways_totalDownloadSizeByt / 1048576.0, 2)
                )
            )
        )
    ) INTO result
    FROM osw_dataset_edges_cte odec
    CROSS JOIN datset_metric_cte dmc
    CROSS JOIN download_stats_cte dsc;

    RETURN result;
END;
$function$
;


--UPDATE FUNCTION "content".tdei_fetch_system_metrics();

CREATE OR REPLACE FUNCTION content.tdei_fetch_system_metrics()
 RETURNS json
 LANGUAGE plpgsql
AS $function$
DECLARE
    result JSON;
BEGIN
    WITH
         -- Aggregation from the dataset table:
         dataset_stat_cte AS (
            SELECT
                COUNT(tdei_dataset_id) AS totaluploads,
                SUM(upload_file_size_bytes) AS totalSizeByt
            FROM content.dataset
            WHERE status NOT IN ('Deleted', 'Draft')
        ),
         -- Count of distinct users (excluding admin roles):
         users_cte AS (
            SELECT COUNT(DISTINCT user_id) AS totalUsers
            FROM public.user_roles ur
            INNER JOIN public.roles r ON ur.role_id = r.role_id
            WHERE r.name != 'tdei_admin'
        ),
         -- Count of active project groups:
         project_groups_cte AS (
            SELECT COUNT(*) AS totalProjectGroups
            FROM public.project_group
            WHERE is_active = 'true'
        ),
         -- Aggregation from the service table:
         services_cte AS (
            SELECT
                COUNT(*) AS totalServices,
                SUM(CASE WHEN service_type = 'osw' THEN 1 ELSE 0 END) AS osw_count,
                SUM(CASE WHEN service_type = 'flex' THEN 1 ELSE 0 END) AS flex_count,
                SUM(CASE WHEN service_type = 'pathways' THEN 1 ELSE 0 END) AS pathways_count
            FROM public.service
            WHERE is_active = 'true'
        ),
         -- Count of downloads coming from the API usage details:
         downloads_api_cte AS (
            SELECT
                COUNT(*) AS totalDownloads
            FROM content.api_usage_details
            WHERE endpoint IN ('/api/v1/osw/:id',
                               '/api/v1/gtfs-flex/:id',
                               '/api/v1/gtfs-pathways/:id')
         ),
         -- Monthly breakdown from api_usage_details:
         downloads_api_per_month_cte AS (
            SELECT
                TO_CHAR(timestamp, 'YYYY') AS year,
                TO_CHAR(timestamp, 'Month') AS month_name,
                COUNT(*) AS download_count
            FROM content.api_usage_details
            WHERE endpoint IN ('/api/v1/osw/:id',
                               '/api/v1/gtfs-flex/:id',
                               '/api/v1/gtfs-pathways/:id')
            GROUP BY TO_CHAR(timestamp, 'YYYY'),
                     TO_CHAR(timestamp, 'Month'),
                     EXTRACT(YEAR FROM timestamp),
                     EXTRACT(MONTH FROM timestamp)
            ORDER BY EXTRACT(YEAR FROM timestamp),
                     EXTRACT(MONTH FROM timestamp)
         ),
         -- Aggregate monthly data into a JSON object per year:
         downloads_api_per_year AS (
            SELECT
                year,
                json_object_agg(month_name, download_count) AS monthly_data
            FROM downloads_api_per_month_cte
            GROUP BY year
         ),
         -- Sum of file sizes based on the API usage details matching a download_stats row:
         downloads_file_size_cte AS (
            SELECT
                SUM(
                    COALESCE(
                        (
                          SELECT SUM(ds.file_size)
                          FROM content.download_stats ds
                          WHERE ds.tdei_dataset_id = aud.request_params->>'id'
                        ), 0)
                ) AS totalDownloadSizeBytes
            FROM content.api_usage_details aud
            WHERE aud.endpoint IN ('/api/v1/osw/:id',
                                   '/api/v1/gtfs-flex/:id',
                                   '/api/v1/gtfs-pathways/:id')
         ),
         -- API usage summary (unchanged):
         aggregated_counts AS (
            SELECT
                endpoint,
                SUM(count) AS total_count
            FROM content.api_usage_summary
            GROUP BY endpoint
         ),
         api_usage_cte AS (
            SELECT
                SUM(total_count) AS totalApiCalls,
                json_agg(
                    json_build_object(
                        'endpoint', endpoint,
                        'count', total_count
                    )
                    ORDER BY total_count DESC
                ) AS apiCallsByEndpoint
            FROM aggregated_counts
         )
    SELECT json_build_object(
        'systemMetrics', json_build_object(
            'totalUsers', uc.totalUsers,
            'totalServices', sc.totalServices,
            'totalProjectGroups', pgc.totalProjectGroups,
            'servicesByType', json_build_object(
                'osw', sc.osw_count,
                'flex', sc.flex_count,
                'pathways', sc.pathways_count
            )
        ),
        'datasetMetrics', json_build_object(
             'totalUploads', json_build_object(
                'count', dsc.totaluploads,
                'totalSizeMB', ROUND(dsc.totalSizeByt / 1048576.0, 2)
            ),
            'totalDownloads', json_build_object(
                'count', da.totalDownloads,
                'totalSizeMB', ROUND(df.totalDownloadSizeBytes / 1048576.0, 2)
            ),
            'downloadsPerMonth', (
                SELECT json_object_agg(year, monthly_data)
                FROM downloads_api_per_year
            )
        ),
        'apiCalls', json_build_object(
            'total', auc.totalApiCalls,
            'byApi', auc.apiCallsByEndpoint
        )
    ) INTO result
    FROM users_cte uc
    CROSS JOIN project_groups_cte pgc
    CROSS JOIN services_cte sc
    CROSS JOIN dataset_stat_cte dsc
    CROSS JOIN downloads_api_cte da
    CROSS JOIN downloads_file_size_cte df
    CROSS JOIN api_usage_cte auc;

    RETURN result;
END;
$function$
;
