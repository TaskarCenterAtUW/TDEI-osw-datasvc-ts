CREATE OR REPLACE FUNCTION content.dataset_tag_road(
	target_dataset_id character varying,
	source_dataset_id character varying)
    RETURNS void
    LANGUAGE 'plpgsql'
AS $BODY$
BEGIN
    -- Create temporary table to store intersected edges
    CREATE TEMP TABLE temp_edges AS
    WITH ds1 AS (
        SELECT *,
               ST_Buffer(ST_Transform(edge_loc, 3857), 5, 'endcap=flat') AS buffered_edge_loc
        FROM content.edge 
        WHERE tdei_dataset_id = target_dataset_id
        AND highway = 'footway'
        AND footway = 'sidewalk' 
    ),
    ds2 AS (
        SELECT *,
               ST_Buffer(ST_Transform(edge_loc, 3857), 5, 'endcap=flat') AS road_buffer_loc
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
        WHERE ST_Intersects(e.buffered_edge_loc, ST_Buffer(ST_Transform(other.edge_loc, 3857), 5, 'endcap=flat')) 
        AND ST_Distance(other.edge_loc, e.edge_loc) < ST_Distance(r.edge_loc, e.edge_loc)
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


CREATE OR REPLACE FUNCTION content.extract_dataset(dataset_id character varying)
    RETURNS TABLE(edges json, nodes json, extensions_points json, extensions_lines json, extensions_polygons json) 
    LANGUAGE 'plpgsql'
AS $BODY$
DECLARE
    temp_row RECORD;
BEGIN
    -- Iterate over intersected edges
    FOR temp_row IN
        SELECT feature
        FROM content.edge where tdei_dataset_id = dataset_id
		ORDER BY edge_id ASC
    LOOP
        edges := temp_row.feature;
		nodes := null;
		extensions_points := null;
		extensions_lines := null;
		extensions_polygons := null;
        RETURN NEXT;
    END LOOP;

--     -- Iterate over intersected nodes
    FOR temp_row IN
        SELECT n.feature
        FROM content.node n
		WHERE tdei_dataset_id = dataset_id
		ORDER BY n.node_id ASC
    LOOP
        edges := null;
		nodes := temp_row.feature;
		extensions_points := null;
		extensions_lines := null;
		extensions_polygons := null;
        RETURN NEXT;
    END LOOP;
	
	-- Pull all the point extension intersecting the bbox
	FOR temp_row IN
        SELECT n.feature
        FROM content.extension_point n
        WHERE n.tdei_dataset_id = dataset_id
		ORDER by n.point_id ASC
    LOOP
         edges := null;
		nodes := null;
		extensions_points := temp_row.feature;
		extensions_lines := null;
		extensions_polygons := null;
        RETURN NEXT;
    END LOOP;

	-- Pull all the line extension intersecting the bbox
	FOR temp_row IN
        SELECT n.feature
        FROM content.extension_line n
        WHERE n.tdei_dataset_id = dataset_id
		ORDER by line_id ASC
    LOOP
        edges := null;
		nodes := null;
		extensions_points := null;
		extensions_lines := temp_row.feature;
		extensions_polygons := null;
        RETURN NEXT;
    END LOOP;
	
	-- Pull all the polygon extension intersecting the bbox
	FOR temp_row IN
        SELECT n.feature
        FROM content.extension_polygon n
        WHERE n.tdei_dataset_id = dataset_id
		ORDER by polygon_id ASC
    LOOP
        edges := null;
		nodes := null;
		extensions_points := null;
		extensions_lines := null;
		extensions_polygons := temp_row.feature;
        RETURN NEXT;
    END LOOP;

    RETURN;
END;
$BODY$;


ALTER TABLE IF EXISTS content.dataset
    ADD COLUMN latest_dataset_url character varying;
ALTER TABLE IF EXISTS content.dataset
    ADD COLUMN latest_osm_url character varying;