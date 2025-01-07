CREATE OR REPLACE FUNCTION content.bbox_intersect(
	dataset_id character varying,
	x_min_param numeric,
	y_min_param numeric,
	x_max_param numeric,
	y_max_param numeric)
    RETURNS TABLE(edges json, nodes json, zones json, extensions_points json, extensions_lines json, extensions_polygons json) 
    LANGUAGE 'plpgsql'
    COST 100
    VOLATILE PARALLEL UNSAFE
    ROWS 1000

AS $BODY$
DECLARE
    temp_row RECORD;
BEGIN
    -- Create temporary table to store intersected edges
    CREATE TEMP TABLE temp_intersected_edges AS
    SELECT e.orig_node_id, e.dest_node_id, e.feature
    FROM content.edge e
    WHERE e.tdei_dataset_id = dataset_id AND ST_Intersects(e.edge_loc, ST_MakeEnvelope(x_min_param, y_min_param, x_max_param, y_max_param, 4326))
	ORDER by edge_id ASC;

    IF NOT EXISTS (SELECT 1 FROM temp_intersected_edges) THEN
        -- Return empty result and finish the job
        RETURN;
    END IF;

    -- Create temporary table to store intersected zones
    CREATE TEMP TABLE temp_intersected_zones AS
    SELECT z.node_ids, z.feature
    FROM content.zone z
    WHERE z.tdei_dataset_id = dataset_id AND ST_Intersects(z.zone_loc, ST_MakeEnvelope(x_min_param, y_min_param, x_max_param, y_max_param, 4326))
	ORDER by z.zone_id ASC;

    -- Iterate over intersected edges
    FOR temp_row IN
        SELECT feature
        FROM temp_intersected_edges
    LOOP
        edges := temp_row.feature::jsonb;
		nodes := null;
        zones := null;
		extensions_points := null;
		extensions_lines := null;
		extensions_polygons := null;
        RETURN NEXT;
    END LOOP;

--     -- Iterate over intersected nodes
    FOR temp_row IN
        SELECT n.feature
        FROM content.node n
        JOIN (
            SELECT orig_node_id AS node_id FROM temp_intersected_edges
            UNION
            SELECT dest_node_id AS node_id FROM temp_intersected_edges
            UNION
            SELECT unnest(node_ids) FROM temp_intersected_zones
        ) e ON n.node_id = e.node_id
		WHERE tdei_dataset_id = dataset_id
		ORDER BY n.node_id ASC
    LOOP
        edges := null;
		nodes := temp_row.feature::jsonb;
		zones := null;
		extensions_points := null;
		extensions_lines := null;
		extensions_polygons := null;
        RETURN NEXT;
    END LOOP;
	
    -- Pull all the zone intersecting the bbox
	FOR temp_row IN
     	SELECT feature
		FROM content.zone z
		WHERE z.tdei_dataset_id = dataset_id AND ST_Intersects(z.zone_loc, ST_MakeEnvelope(x_min_param, y_min_param, x_max_param, y_max_param, 4326))
		ORDER by zone_id ASC
    LOOP
        edges := null;
		nodes := null;
		zones := temp_row.feature::jsonb;
		extensions_points := null;
		extensions_lines := null;
		extensions_polygons := null;
        RETURN NEXT;
    END LOOP;

	-- Pull all the point extension intersecting the bbox
	FOR temp_row IN
        SELECT n.feature
        FROM content.extension_point n
        WHERE n.tdei_dataset_id = dataset_id AND ST_Intersects(n.point_loc, ST_MakeEnvelope(x_min_param, y_min_param, x_max_param, y_max_param, 4326))
		ORDER by n.point_id ASC
    LOOP
         edges := null;
		nodes := null;
        zones := null;
		extensions_points := temp_row.feature::jsonb;
		extensions_lines := null;
		extensions_polygons := null;
        RETURN NEXT;
    END LOOP;

	-- Pull all the line extension intersecting the bbox
	FOR temp_row IN
        SELECT n.feature
        FROM content.extension_line n
        WHERE n.tdei_dataset_id = dataset_id AND ST_Intersects(n.line_loc, ST_MakeEnvelope(x_min_param, y_min_param, x_max_param, y_max_param, 4326))
		ORDER by line_id ASC
    LOOP
         edges := null;
		nodes := null;
        zones := null;
		extensions_points := null;
		extensions_lines := temp_row.feature::jsonb;
		extensions_polygons := null;
        RETURN NEXT;
    END LOOP;
	
	-- Pull all the polygon extension intersecting the bbox
	FOR temp_row IN
        SELECT n.feature
        FROM content.extension_polygon n
        WHERE n.tdei_dataset_id = dataset_id AND ST_Intersects(n.polygon_loc, ST_MakeEnvelope(x_min_param, y_min_param, x_max_param, y_max_param, 4326))
		ORDER by polygon_id ASC
    LOOP
        edges := null;
		nodes := null;
        zones := null;
		extensions_points := null;
		extensions_lines := null;
		extensions_polygons := temp_row.feature::jsonb;
        RETURN NEXT;
    END LOOP;
	
    -- Drop the temporary table
    DROP TABLE IF EXISTS temp_intersected_edges;
    DROP TABLE IF EXISTS temp_intersected_zones;

    RETURN;
END;
$BODY$;