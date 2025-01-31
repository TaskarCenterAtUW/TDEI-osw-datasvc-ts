-- Remove the UNIQUE constraint for api_endpoint and date
ALTER TABLE IF EXISTS content.api_usage_summary
DROP CONSTRAINT IF EXISTS unique_api_endpoint_date;

-- Drop the Summary of API Usage table
DROP TABLE IF EXISTS content.api_usage_summary;

-- Drop the Detailed API Usage Logs table
DROP TABLE IF EXISTS content.api_usage_details;

-- Drop the indexes
DROP INDEX IF EXISTS content.idx_api_usage_summary_date;
DROP INDEX IF EXISTS content.idx_api_usage_details_endpoint_date;

CREATE OR REPLACE FUNCTION content.tdei_fetch_system_metrics()
RETURNS JSON AS $$
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
        )
    ) INTO result
    FROM users_cte uc
    CROSS JOIN project_groups_cte pgc
    CROSS JOIN services_cte sc
    CROSS JOIN dataset_stat_cte dsc
    CROSS JOIN downloads_cte dc
	  CROSS JOIN downloads_per_year dpy;

    -- Return the result as a JSON array
    RETURN result;
END;
$$ LANGUAGE plpgsql;
