-- DOWNGRADE FUNCTION "content".tdei_fetch_data_metrics();

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
            SUM(num_edges) as num_edges,
            ROUND(CAST((SUM(length_of_sidewalks_mtr)/1000) AS numeric),2) as length_of_sidewalks_km,
            SUM(num_crossings) AS num_crossings,
            SUM(num_nodes) as num_nodes,
            SUM(area_km2) as area_km2
            FROM content.osw_stats os
            INNER JOIN content.dataset ds ON os.tdei_dataset_id = ds.tdei_dataset_id
            WHERE ds.status not in ('Deleted', 'Draft')
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
            WHERE status not in ('Deleted', 'Draft')
        ),
        download_stats_cte AS (
            SELECT
                SUM(CASE WHEN data_type = 'osw' THEN 1 ELSE 0 END) AS osw_totalDownloadDatasets,
                SUM(CASE WHEN data_type = 'flex' THEN 1 ELSE 0 END) AS flex_totalDownloadDatasets,
                SUM(CASE WHEN data_type = 'pathways' THEN 1 ELSE 0 END) AS pathways_totalDownloadDatasets,
                SUM(CASE WHEN data_type = 'osw' THEN file_size ELSE 0 END) AS osw_totalDownloadSizeByt,
                SUM(CASE WHEN data_type = 'flex' THEN file_size ELSE 0 END) AS flex_totalDownloadSizeByt,
                SUM(CASE WHEN data_type = 'pathways' THEN file_size ELSE 0 END) AS pathways_totalDownloadSizeByt
            FROM content.download_stats
        )

    SELECT json_build_object(
        'dataMetrics', json_build_object(
            'datasetByType' , json_build_object(
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
                    'area_km2', ROUND(CAST(odec.area_km2 as DECIMAL),2)
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

-- DOWNGRADE FUNCTION "content".tdei_fetch_system_metrics();

CREATE OR REPLACE FUNCTION content.tdei_fetch_system_metrics()
 RETURNS json
 LANGUAGE plpgsql
AS $function$
DECLARE
    result JSON;
BEGIN
    -- Using CTEs to aggregate metrics from multiple tables
    WITH
         dataset_stat_cte AS (
            SELECT
            COUNT(tdei_dataset_id) as totaluploads,
            SUM(upload_file_size_bytes) AS totalSizeByt
            FROM content.dataset WHERE status not in ('Deleted', 'Draft')
        ),
        users_cte AS (
            SELECT count(Distinct(user_id)) as totalUsers FROM public.user_roles ur
            INNER JOIN public.roles r ON ur.role_id = r.role_id
            WHERE r.name != 'tdei_admin'
        ),
        project_groups_cte AS (
            SELECT COUNT(*) as totalProjectGroups FROM public.project_group WHERE is_active = 'true'
        ),
        services_cte AS (
            SELECT
            COUNT(*) AS totalServices,
            SUM(CASE WHEN service_type = 'osw' THEN 1 ELSE 0 END) AS osw_count,
            SUM(CASE WHEN service_type = 'flex' THEN 1 ELSE 0 END) AS flex_count,
            SUM(CASE WHEN service_type = 'pathways' THEN 1 ELSE 0 END) AS pathways_count
            FROM public.service WHERE is_active = 'true'
        ),
        downloads_cte AS (
            SELECT
            	  COUNT(*) AS totalDownloads,
	              SUM(file_size) AS totalDownloadSizeBytes
    	      FROM content.download_stats
    	  ),
		    downloads_per_month_cte AS (
            SELECT
                TO_CHAR(requested_datetime, 'YYYY') AS year,
                TO_CHAR(requested_datetime, 'Month') AS month_name,
                COUNT(*) AS download_count
            FROM content.download_stats
            GROUP BY TO_CHAR(requested_datetime, 'YYYY'), TO_CHAR(requested_datetime, 'Month'),
                     EXTRACT(YEAR FROM requested_datetime), EXTRACT(MONTH FROM requested_datetime)
            ORDER BY EXTRACT(YEAR FROM requested_datetime), EXTRACT(MONTH FROM requested_datetime)
        ),
        downloads_per_year AS (
            SELECT
                year,
                json_object_agg(month_name, download_count) AS monthly_data
            FROM downloads_per_month_cte
            GROUP BY year
        ),
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
    -- Build the JSON result
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
            	'count', dc.totalDownloads,
	            'totalSizeMB', ROUND(dc.totalDownloadSizeBytes / 1048576.0, 2)
        	  ),
			      'downloadsPerMonth', (SELECT json_object_agg(year, monthly_data) FROM downloads_per_year)
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
    CROSS JOIN downloads_cte dc
	CROSS JOIN downloads_per_year dpy
	CROSS JOIN api_usage_cte auc;

    -- Return the result as a JSON array
    RETURN result;
END;
$function$
;
