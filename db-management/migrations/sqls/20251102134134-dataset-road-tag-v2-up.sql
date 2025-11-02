CREATE OR REPLACE FUNCTION content.dataset_tag_road(
    target_dataset_id   character varying,
    source_dataset_id   character varying,
    buffer_meters       double precision DEFAULT 5
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
    -- Step 1: Select candidates (buffer used for both sidewalk and road)
    CREATE TEMP TABLE temp_edges ON COMMIT DROP AS
    WITH sidewalks AS (
        SELECT 
            e.edge_id,
            e.tdei_dataset_id,
            e.feature,
            e.edge_loc_3857,
            ST_Buffer(e.edge_loc_3857, buffer_meters, 'endcap=flat') AS sidewalk_buffer
        FROM content.edge e
        WHERE e.tdei_dataset_id = target_dataset_id
          AND e.highway = 'footway'
          AND e.footway = 'sidewalk'
    ),
    roads AS (
        SELECT 
            r.edge_id,
            r.name,
            r.edge_loc_3857,
            ST_Buffer(r.edge_loc_3857, buffer_meters, 'endcap=flat') AS road_buffer
        FROM content.edge r
        WHERE r.tdei_dataset_id = source_dataset_id
          AND r.highway IN ('residential','service','primary','secondary','tertiary')
          AND COALESCE(r.name, '') <> ''
    ),
    candidates AS (
        SELECT 
            s.edge_id AS sidewalk_id,
            s.tdei_dataset_id,
            r.edge_id AS road_id,
            r.name,
            ST_Length(ST_Intersection(s.edge_loc_3857, r.edge_loc_3857)) AS overlap_len
        FROM sidewalks s
        JOIN roads r 
          ON (
               ST_Intersects(s.sidewalk_buffer, r.road_buffer)
               OR ST_Touches(s.sidewalk_buffer, r.road_buffer)
             )
    ),
    ranked AS (
        SELECT 
            c.sidewalk_id,
            c.tdei_dataset_id,
            c.name AS description,
            ROW_NUMBER() OVER (
                PARTITION BY c.sidewalk_id 
                ORDER BY c.overlap_len DESC NULLS LAST
            ) AS rank
        FROM candidates c
    )
    SELECT 
        sidewalk_id, 
        tdei_dataset_id, 
        description
    FROM ranked
    WHERE rank = 1;

    -- Step 2: Update sidewalks with road names
    UPDATE content.edge e
    SET feature = jsonb_set(
        e.feature::jsonb,
        '{properties, description}',
        to_jsonb(t.description),
        true
    )
    FROM temp_edges t
    WHERE t.sidewalk_id = e.edge_id
      AND e.tdei_dataset_id = target_dataset_id;

END;
$$;