CREATE OR REPLACE FUNCTION content.tdei_get_download_stats(
    IN from_date_str text DEFAULT NULL,
    IN to_date_str   text DEFAULT NULL
)
RETURNS TABLE(
    full_name text,
    user_name text,
    total_number_of_downloads bigint,
    osw_file_downloads bigint
) 
LANGUAGE plpgsql
AS $BODY$
DECLARE
    from_date timestamp without time zone;
    to_date   timestamp without time zone;
BEGIN
    -- Parse ISO string inputs or apply defaults
    from_date := COALESCE(from_date_str::timestamp, now() - interval '7 days');
    to_date   := COALESCE(to_date_str::timestamp, now());

    RETURN QUERY
    SELECT 
        concat(ue.first_name, ' ', ue.last_name)::text AS full_name,
        ue.username::text AS user_name,
        count(*)::bigint AS total_number_of_downloads,
        sum(CASE WHEN ds.data_type = 'osw' THEN 1 ELSE 0 END)::bigint AS osw_file_downloads
    FROM content.download_stats ds
    INNER JOIN keycloak.user_entity ue 
        ON ds.user_id = ue.id
    WHERE ds.requested_datetime BETWEEN from_date AND to_date
    GROUP BY ds.user_id, ue.first_name, ue.last_name, ue.username
    ORDER BY total_number_of_downloads DESC, ue.first_name ASC;
END;
$BODY$;