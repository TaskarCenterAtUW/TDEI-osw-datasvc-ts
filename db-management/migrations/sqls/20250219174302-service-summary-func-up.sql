CREATE OR REPLACE FUNCTION content.get_services_summary_by_project_group(_project_group_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
AS $function$
DECLARE
    v_result JSONB;
    v_exists BOOLEAN;
BEGIN
    -- 1) Check if the project group exists in public.project_group
    SELECT EXISTS (
        SELECT 1
        FROM public.project_group
        WHERE project_group_id = _project_group_id::text
    )
    INTO v_exists;

    IF NOT v_exists THEN
        RAISE EXCEPTION 'Project group with ID % does not exist.', _project_group_id;
    END IF;

    -- 2) If it exists, run your original logic
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
        WHERE s.owner_project_group = _project_group_id::text
        GROUP BY s.service_id, s.name
    )
    SELECT json_build_object(
        'services', json_agg(
            json_build_object(
                'service_name', service_name,
                'service_id', service_id,
                'dataset_count', dataset_count,
                'total_unzipped_size_mb', ROUND(total_unzipped_size_mb, 2)
            )
        )
    )::jsonb
    INTO v_result
    FROM service_agg;

    RETURN v_result;
END;
$function$;
