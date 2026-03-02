DROP FUNCTION IF EXISTS content.tdei_dataset_spatial_join(text, text, text);

CREATE OR REPLACE FUNCTION content.tdei_dataset_spatial_join(
	destination_dataset_id text,
	dynamic_queries text[],
	destination_element text)
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
	step TEXT;
BEGIN

    -- Execute the dynamic query to create a temporary table
	FOREACH step IN ARRAY dynamic_queries LOOP
	    EXECUTE step;
	END LOOP;

IF destination_element = 'edge' THEN
    -- Iterate over intersected edges
	fname := 'edge';
    result_cursor := 'edge_cursor';
	OPEN result_cursor FOR 
		SELECT feature
		FROM temp_dataset_join_result;
	 -- Assign OUT parameters and return
    file_name := fname;
    cursor_ref := result_cursor;
    RETURN NEXT;

    -- Iterate over intersected nodes
    fname := 'node';
    result_cursor := 'node_cursor';
	OPEN result_cursor FOR 
		SELECT n.feature
		FROM content.node n
		WHERE n.tdei_dataset_id = destination_dataset_id
		ORDER BY n.id ASC;
    file_name := fname;
    cursor_ref := result_cursor;
    RETURN NEXT;

       -- Pull all the zone intersecting the bbox
	fname := 'zone';
    result_cursor := 'zone_cursor';
	OPEN result_cursor FOR 
		SELECT z.feature
		FROM content.zone z
		WHERE z.tdei_dataset_id = destination_dataset_id
		ORDER by z.id ASC;
   file_name := fname;
    cursor_ref := result_cursor;
    RETURN NEXT;
	
	-- Pull all the point extension intersecting the bbox
	fname := 'point';
    result_cursor := 'point_cursor';
	OPEN result_cursor FOR 
		SELECT n.feature
		FROM content.extension_point n
		WHERE n.tdei_dataset_id = destination_dataset_id
		ORDER by n.id ASC;
   	file_name := fname;
    cursor_ref := result_cursor;
    RETURN NEXT;

	-- Pull all the line extension intersecting the bbox
	fname := 'line';
    result_cursor := 'line_cursor';
	OPEN result_cursor FOR 
		SELECT n.feature
		FROM content.extension_line n
		WHERE n.tdei_dataset_id = destination_dataset_id
		ORDER by n.id ASC;
    file_name := fname;
    cursor_ref := result_cursor;
    RETURN NEXT;
	
	-- Pull all the polygon extension intersecting the bbox
	fname := 'polygon';
    result_cursor := 'polygon_cursor';
	OPEN result_cursor FOR 
		SELECT n.feature
		FROM content.extension_polygon n
		WHERE n.tdei_dataset_id = destination_dataset_id
		ORDER by n.id ASC;
    file_name := fname;
    cursor_ref := result_cursor;
    RETURN NEXT;

	-- Loop through each unique ext_file_id
    FOR extension_files IN
        SELECT id, name FROM content.extension_file WHERE tdei_dataset_id = destination_dataset_id 
    LOOP
		result_cursor := extension_files.name || '_cursor';
	    OPEN result_cursor FOR 
        SELECT e.feature 
        FROM content.extension e
        WHERE e.tdei_dataset_id = destination_dataset_id AND ext_file_id = extension_files.id;
         -- Assign OUT parameters and return
	    file_name := extension_files.name;
	    cursor_ref := result_cursor;
        RETURN NEXT;
    END LOOP;
	
END IF;
	
IF destination_element = 'node' THEN

    fname := 'edge';
    result_cursor := 'edge_cursor';
    OPEN result_cursor FOR 
        SELECT feature
        FROM content.edge e
		WHERE e.tdei_dataset_id = destination_dataset_id
		ORDER by e.id ASC;
    file_name := fname;
    cursor_ref := result_cursor;
    RETURN NEXT;

    -- Iterate over intersected nodes
    fname := 'node';
    result_cursor := 'node_cursor';
    OPEN result_cursor FOR 
        SELECT DISTINCT ON(n.node_id) n.feature
        FROM temp_dataset_join_result n
		ORDER BY n.node_id ASC;
    file_name := fname;
    cursor_ref := result_cursor;
    RETURN NEXT;

       -- Pull all the zone intersecting the bbox
	fname := 'zone';
    result_cursor := 'zone_cursor';
    OPEN result_cursor FOR 
     	SELECT z.feature
		FROM content.zone z
	    WHERE z.tdei_dataset_id = destination_dataset_id
		ORDER by z.id ASC;
    file_name := fname;
    cursor_ref := result_cursor;
    RETURN NEXT;
	
	-- Pull all the point extension intersecting the bbox
	fname := 'point';
    result_cursor := 'point_cursor';
    OPEN result_cursor FOR 
        SELECT n.feature
        FROM content.extension_point n
        WHERE n.tdei_dataset_id = destination_dataset_id
		ORDER by n.id ASC;
    file_name := fname;
    cursor_ref := result_cursor;
    RETURN NEXT;
	
	-- Pull all the line extension intersecting the bbox
	fname := 'line';
    result_cursor := 'line_cursor';
    OPEN result_cursor FOR 
        SELECT n.feature
        FROM content.extension_line n
        WHERE n.tdei_dataset_id = destination_dataset_id
		ORDER by n.id ASC;
    file_name := fname;
    cursor_ref := result_cursor;
    RETURN NEXT;
	
	-- Pull all the polygon extension intersecting the bbox
	fname := 'polygon';
    result_cursor := 'polygon_cursor';
    OPEN result_cursor FOR 
        SELECT n.feature
        FROM content.extension_polygon n
        WHERE n.tdei_dataset_id = destination_dataset_id
		ORDER by n.id ASC;
		
    file_name := fname;
    cursor_ref := result_cursor;
    RETURN NEXT;

	-- Loop through each unique ext_file_id
    FOR extension_files IN
        SELECT id, name FROM content.extension_file WHERE tdei_dataset_id = destination_dataset_id 
    LOOP
		result_cursor := extension_files.name || '_cursor';
	    OPEN result_cursor FOR 
        SELECT e.feature 
        FROM content.extension e
        WHERE e.tdei_dataset_id = destination_dataset_id AND ext_file_id = extension_files.id;
         -- Assign OUT parameters and return
	    file_name := extension_files.name;
	    cursor_ref := result_cursor;
        RETURN NEXT;
    END LOOP;
	
END IF;

IF destination_element = 'zone' THEN
    -- Iterate over intersected edges
    fname := 'edge';
    result_cursor := 'edge_cursor';
    OPEN result_cursor FOR 
        SELECT e.feature
        FROM content.edge e
        WHERE e.tdei_dataset_id = destination_dataset_id
		ORDER BY e.id ASC;
    file_name := fname;
    cursor_ref := result_cursor;
    RETURN NEXT;

    -- Iterate over intersected nodes
    fname := 'node';
    result_cursor := 'node_cursor';
    OPEN result_cursor FOR 
    	SELECT n.feature
        FROM content.node n
		WHERE n.tdei_dataset_id = destination_dataset_id
		ORDER BY n.id ASC;
    file_name := fname;
    cursor_ref := result_cursor;
    RETURN NEXT;

       -- Pull all the zone intersecting the bbox
	fname := 'zone';
    result_cursor := 'zone_cursor';
    OPEN result_cursor FOR 
     	SELECT DISTINCT ON(z.zone_id) z.feature
		FROM temp_dataset_join_result z
		ORDER by z.zone_id ASC;
    file_name := fname;
    cursor_ref := result_cursor;
    RETURN NEXT;
	
	-- Pull all the point extension intersecting the bbox
	fname := 'point';
    result_cursor := 'point_cursor';
    OPEN result_cursor FOR 
        SELECT n.feature
        FROM content.extension_point n
        WHERE n.tdei_dataset_id = destination_dataset_id
		ORDER by n.id ASC;
    file_name := fname;
    cursor_ref := result_cursor;
    RETURN NEXT;

	-- Pull all the line extension intersecting the bbox
	fname := 'line';
    result_cursor := 'line_cursor';
    OPEN result_cursor FOR 
        SELECT n.feature
        FROM content.extension_line n
        WHERE n.tdei_dataset_id = destination_dataset_id
		ORDER by n.id ASC;
    file_name := fname;
    cursor_ref := result_cursor;
    RETURN NEXT;
	
	-- Pull all the polygon extension intersecting the bbox
	fname := 'polygon';
    result_cursor := 'polygon_cursor';
    OPEN result_cursor FOR 
        SELECT n.feature
        FROM content.extension_polygon n
        WHERE n.tdei_dataset_id = destination_dataset_id
		ORDER by n.id ASC;
    file_name := fname;
    cursor_ref := result_cursor;
    RETURN NEXT;

	-- Loop through each unique ext_file_id
    FOR extension_files IN
        SELECT id, name FROM content.extension_file WHERE tdei_dataset_id = destination_dataset_id 
    LOOP
		result_cursor := extension_files.name || '_cursor';
	    OPEN result_cursor FOR 
        SELECT e.feature 
        FROM content.extension e
        WHERE e.tdei_dataset_id = destination_dataset_id AND ext_file_id = extension_files.id;
         -- Assign OUT parameters and return
	    file_name := extension_files.name;
	    cursor_ref := result_cursor;
        RETURN NEXT;
    END LOOP;
	
END IF;

    RETURN;
END;
$BODY$;