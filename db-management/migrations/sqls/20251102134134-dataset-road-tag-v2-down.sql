-- FUNCTION: content.dataset_tag_road(character varying, character varying)

-- DROP FUNCTION IF EXISTS content.dataset_tag_road(character varying, character varying);

CREATE OR REPLACE FUNCTION content.dataset_tag_road(
	target_dataset_id character varying,
	source_dataset_id character varying)
    RETURNS void
    LANGUAGE 'plpgsql'
    COST 100
    VOLATILE PARALLEL UNSAFE
AS $BODY$
BEGIN
    -- Create temporary table to store intersected edges
    CREATE TEMP TABLE temp_edges ON COMMIT DROP AS
    WITH ds1 AS (
        SELECT *,
               ST_Buffer(edge_loc_3857, 5, 'endcap=flat') AS buffered_edge_loc
        FROM content.edge 
        WHERE tdei_dataset_id = target_dataset_id
        AND highway = 'footway'
        AND footway = 'sidewalk' 
    ),
    ds2 AS (
        SELECT *,
               ST_Buffer(edge_loc_3857, 5, 'endcap=flat') AS road_buffer_loc
        FROM content.edge
        WHERE tdei_dataset_id = source_dataset_id 
        AND (highway IN ('residential', 'service', 'primary', 'tertiary', 'secondary'))
        AND name != ''
    )
    SELECT r.name AS description, e.edge_id, e.feature, e.tdei_dataset_id
    FROM ds1 e
    JOIN ds2 r ON ST_Intersects(e.buffered_edge_loc, r.road_buffer_loc)
    WHERE NOT EXISTS (
        SELECT 1 
        FROM ds2 other
        WHERE ST_Intersects(e.buffered_edge_loc, ST_Buffer(other.edge_loc_3857, 5, 'endcap=flat')) 
        AND ST_Distance(other.edge_loc_3857, e.edge_loc_3857) < ST_Distance(r.edge_loc_3857, e.edge_loc_3857)
    );

    -- Update edge features
    UPDATE content.edge e
    SET feature = jsonb_set(
                     e.feature::jsonb,
                     '{properties, description}',
                     (
                         SELECT COALESCE(to_jsonb(e2.description), '{}'::jsonb)
                         FROM temp_edges e2
                         WHERE e2.edge_id = e.edge_id AND e2.tdei_dataset_id = target_dataset_id
						 LIMIT 1
                     ),
                     true
                 )
    FROM temp_edges te
    WHERE te.edge_id = e.edge_id AND e.tdei_dataset_id = target_dataset_id;

    RETURN;
END;
$BODY$;

ALTER FUNCTION content.dataset_tag_road(character varying, character varying)
    OWNER TO tdeiadmin;
