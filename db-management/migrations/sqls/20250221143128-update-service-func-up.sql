CREATE OR REPLACE FUNCTION content.get_services_summary_by_project_group(_project_group_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
AS $function$
DECLARE
    v_result JSONB;
    v_exists BOOLEAN;
    v_project_group RECORD;
BEGIN
    -- 1) Fetch project group details from public.project_group
    SELECT project_group_id, name
    INTO v_project_group
    FROM public.project_group
    WHERE project_group_id = _project_group_id::TEXT;

    -- 2) Check if the project group exists
    IF v_project_group IS NULL THEN
        RAISE EXCEPTION 'Project group with ID % does not exist.', _project_group_id;
    END IF;

    -- 3) Fetch service summary data
    WITH service_agg AS (
        SELECT
            s.name AS service_name,
            s.service_id,
            COALESCE(COUNT(d.tdei_dataset_id), 0) AS dataset_count,
            COALESCE(SUM(d.upload_file_size_bytes) / 1048576.0, 0) AS total_unzipped_size_mb
        FROM public.service s
        LEFT JOIN content.dataset d
               ON d.tdei_service_id = s.service_id
              AND d.tdei_project_group_id = s.owner_project_group
        WHERE s.owner_project_group = _project_group_id::TEXT
        GROUP BY s.service_id, s.name
    )
    SELECT json_build_object(
        'project_group', json_build_object(
            'id', v_project_group.project_group_id,
            'name', v_project_group.name
        ),
        'services', COALESCE(json_agg(
            json_build_object(
                'service_id', service_id,
                'service_name', service_name,
                'dataset_count', dataset_count,
                'total_unzipped_size_mb', ROUND(total_unzipped_size_mb, 2)
            )
        ), '[]'::json) -- Ensure empty array if no services
    )::jsonb
    INTO v_result
    FROM service_agg;

    RETURN v_result;
END;
$function$;
