CREATE OR REPLACE FUNCTION content.bbox_intersect(
	dataset_id character varying,
	x_min_param numeric,
	y_min_param numeric,
	x_max_param numeric,
	y_max_param numeric)
    RETURNS TABLE(file_name text, cursor_ref refcursor) 
    LANGUAGE 'plpgsql'
    COST 100
    VOLATILE PARALLEL UNSAFE
    ROWS 1000

AS $BODY$
DECLARE
    result_cursor REFCURSOR; -- Unique cursor for edges
    fname TEXT;
	extension_files RECORD;
BEGIN
    -- Create temporary table to store intersected edges
    CREATE TEMP TABLE temp_intersected_edges ON COMMIT DROP AS
    SELECT e.orig_node_id, e.dest_node_id, e.feature
    FROM content.edge e
    WHERE e.tdei_dataset_id = dataset_id AND ST_Intersects(e.edge_loc, ST_MakeEnvelope(x_min_param, y_min_param, x_max_param, y_max_param, 4326))
	ORDER by edge_id ASC;

    IF NOT EXISTS (SELECT 1 FROM temp_intersected_edges) THEN
        -- Return empty result and finish the job
        RETURN;
    END IF;

    -- Create temporary table to store intersected zones
    CREATE TEMP TABLE temp_intersected_zones ON COMMIT DROP AS
    SELECT z.node_ids, z.feature
    FROM content.zone z
    WHERE z.tdei_dataset_id = dataset_id AND ST_Intersects(z.zone_loc, ST_MakeEnvelope(x_min_param, y_min_param, x_max_param, y_max_param, 4326))
	ORDER by z.zone_id ASC;

    -- Iterate over intersected edges
    fname := 'edge';
    result_cursor := 'edge_cursor';
    OPEN result_cursor FOR 
	SELECT feature
	FROM temp_intersected_edges;
	 -- Assign OUT parameters and return
    file_name := fname;
    cursor_ref := result_cursor;
    RETURN NEXT;

--     -- Iterate over intersected nodes
    fname := 'node';
    result_cursor := 'node_cursor';
    OPEN result_cursor FOR 
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
		ORDER BY n.node_id ASC;
	 -- Assign OUT parameters and return
    file_name := fname;
    cursor_ref := result_cursor;
    RETURN NEXT;
	
    -- Pull all the zone intersecting the bbox
	 fname := 'zone';
    result_cursor := 'zone_cursor';
    OPEN result_cursor FOR 
     	SELECT feature
		FROM content.zone z
		WHERE z.tdei_dataset_id = dataset_id AND ST_Intersects(z.zone_loc, ST_MakeEnvelope(x_min_param, y_min_param, x_max_param, y_max_param, 4326))
		ORDER by zone_id ASC;
   -- Assign OUT parameters and return
    file_name := fname;
    cursor_ref := result_cursor;
    RETURN NEXT;

	-- Pull all the point extension intersecting the bbox
	 fname := 'point';
    result_cursor := 'point_cursor';
    OPEN result_cursor FOR 
		SELECT n.feature
        FROM content.extension_point n
        WHERE n.tdei_dataset_id = dataset_id AND ST_Intersects(n.point_loc, ST_MakeEnvelope(x_min_param, y_min_param, x_max_param, y_max_param, 4326))
		ORDER by n.point_id ASC;
   -- Assign OUT parameters and return
    file_name := fname;
    cursor_ref := result_cursor;
    RETURN NEXT;

	-- Pull all the line extension intersecting the bbox
	 fname := 'line';
    result_cursor := 'line_cursor';
    OPEN result_cursor FOR 
        SELECT n.feature
        FROM content.extension_line n
        WHERE n.tdei_dataset_id = dataset_id AND ST_Intersects(n.line_loc, ST_MakeEnvelope(x_min_param, y_min_param, x_max_param, y_max_param, 4326))
		ORDER by line_id ASC;
 	 -- Assign OUT parameters and return
    file_name := fname;
    cursor_ref := result_cursor;
    RETURN NEXT;
	
	-- Pull all the polygon extension intersecting the bbox
	fname := 'polygon';
    result_cursor := 'polygon_cursor';
    OPEN result_cursor FOR 
        SELECT n.feature
        FROM content.extension_polygon n
        WHERE n.tdei_dataset_id = dataset_id AND ST_Intersects(n.polygon_loc, ST_MakeEnvelope(x_min_param, y_min_param, x_max_param, y_max_param, 4326))
		ORDER by polygon_id ASC;
   -- Assign OUT parameters and return
    file_name := fname;
    cursor_ref := result_cursor;
    RETURN NEXT;

	-- Loop through each unique ext_file_id
   FOR extension_files IN
        SELECT id, name FROM content.extension_file WHERE tdei_dataset_id = dataset_id 
    LOOP
		result_cursor := extension_files.name || '_cursor';
	    OPEN result_cursor FOR 
        SELECT e.feature 
        FROM content.extension e
        WHERE e.tdei_dataset_id = dataset_id AND ext_file_id = extension_files.id AND ST_Intersects(e.ext_loc, ST_MakeEnvelope(x_min_param, y_min_param, x_max_param, y_max_param, 4326));
         -- Assign OUT parameters and return
	    file_name := extension_files.name;
	    cursor_ref := result_cursor;
        RETURN NEXT;
    END LOOP;
    RETURN;
END;
$BODY$;

ALTER FUNCTION content.bbox_intersect(character varying, numeric, numeric, numeric, numeric)
    OWNER TO tdeiadmin;
