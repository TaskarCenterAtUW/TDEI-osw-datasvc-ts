CREATE OR REPLACE FUNCTION content.tdei_dataset_spatial_join(
	destination_dataset_id text,
	dynamic_query text,
	destination_element text)
    RETURNS TABLE(edges json, nodes json, zones json, extensions_points json, extensions_lines json, extensions_polygons json) 
    LANGUAGE 'plpgsql'
    COST 100
    VOLATILE PARALLEL UNSAFE
    ROWS 1000

AS $BODY$
DECLARE
    temp_row RECORD;
BEGIN

    -- Execute the dynamic query to create a temporary table
    EXECUTE 'CREATE TEMP TABLE temp_dataset_join_result ON COMMIT DROP AS ' || dynamic_query;

IF destination_element = 'edge' THEN
    -- Iterate over intersected edges
    FOR temp_row IN
        SELECT feature
        FROM temp_dataset_join_result
    LOOP
        edges := temp_row.feature::jsonb;
		nodes := null;
		zones := null;
		extensions_points := null;
		extensions_lines := null;
		extensions_polygons := null;
        RETURN NEXT;
    END LOOP; 

    -- Iterate over intersected nodes
    FOR temp_row IN
        SELECT n.feature
        FROM content.node n
        -- JOIN (
        --    SELECT DISTINCT node_id 
        --     FROM (
        --     SELECT orig_node_id AS node_id FROM temp_dataset_join_result
        --     UNION ALL
        --     SELECT dest_node_id AS node_id FROM temp_dataset_join_result
        -- ) subquery
        -- ) e ON n.node_id = e.node_id
		WHERE n.tdei_dataset_id = destination_dataset_id
		ORDER BY n.id ASC
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
     	SELECT z.feature
		FROM content.zone z
	    WHERE z.tdei_dataset_id = destination_dataset_id
		ORDER by z.id ASC
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
        WHERE n.tdei_dataset_id = destination_dataset_id
		ORDER by n.id ASC
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
        WHERE n.tdei_dataset_id = destination_dataset_id
		ORDER by n.id ASC
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
        WHERE n.tdei_dataset_id = destination_dataset_id
		ORDER by n.id ASC
    LOOP
        edges := null;
		nodes := null;
		zones := null;
		extensions_points := null;
		extensions_lines := null;
		extensions_polygons := temp_row.feature::jsonb;
        RETURN NEXT;
    END LOOP;
END IF;
	
IF destination_element = 'node' THEN

 --    CREATE TEMP TABLE temp_intersected_edges ON COMMIT DROP AS
 --    SELECT DISTINCT ON (e.orig_node_id, e.dest_node_id, e.edge_id) e.feature, e.edge_loc
 --    FROM content.edge e
 --    INNER JOIN temp_dataset_join_result node ON e.orig_node_id = node.node_id OR e.dest_node_id = node.node_id
	-- WHERE e.tdei_dataset_id = destination_dataset_id
	-- ORDER BY e.orig_node_id, e.dest_node_id, e.edge_id ASC;
    -- Iterate over intersected edges
    FOR temp_row IN
        SELECT feature
        FROM content.edge e
		WHERE e.tdei_dataset_id = destination_dataset_id
		ORDER by e.id ASC
    LOOP
        edges := temp_row.feature::jsonb;
		nodes := null;
		zones := null;
		extensions_points := null;
		extensions_lines := null;
		extensions_polygons := null;
        RETURN NEXT;
    END LOOP; 

    -- Iterate over intersected nodes
    FOR temp_row IN
        SELECT DISTINCT ON(n.node_id) n.feature
        FROM temp_dataset_join_result n
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
     	SELECT z.feature
		FROM content.zone z
        -- INNER JOIN temp_dataset_join_result ON ST_Intersects(z.zone_loc, temp_dataset_join_result.node_loc)
	    WHERE z.tdei_dataset_id = destination_dataset_id
		ORDER by z.id ASC
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
        WHERE n.tdei_dataset_id = destination_dataset_id
		ORDER by n.id ASC
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
        WHERE n.tdei_dataset_id = destination_dataset_id
		ORDER by n.id ASC
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
        WHERE n.tdei_dataset_id = destination_dataset_id
		ORDER by n.id ASC
    LOOP
        edges := null;
		nodes := null;
		zones := null;
		extensions_points := null;
		extensions_lines := null;
		extensions_polygons := temp_row.feature::jsonb;
        RETURN NEXT;
    END LOOP;
END IF;

IF destination_element = 'zone' THEN
    -- Iterate over intersected edges
    FOR temp_row IN
        SELECT e.feature
        FROM content.edge e
        -- INNER JOIN temp_dataset_join_result z ON ST_Intersects(z.zone_loc, e.edge_loc)
        WHERE e.tdei_dataset_id = destination_dataset_id
		ORDER BY e.id ASC
    LOOP
        edges := temp_row.feature::jsonb;
		nodes := null;
		zones := null;
		extensions_points := null;
		extensions_lines := null;
		extensions_polygons := null;
        RETURN NEXT;
    END LOOP; 

    -- Iterate over intersected nodes
    FOR temp_row IN
    	SELECT n.feature
        FROM content.node n
 --        JOIN (
 -- 			SELECT DISTINCT unnest(node_ids) AS node_ids
 --    		FROM temp_dataset_join_result
	-- ) e ON n.node_id = e.node_ids
		WHERE n.tdei_dataset_id = destination_dataset_id
		ORDER BY n.id ASC
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
     	SELECT DISTINCT ON(z.zone_id) z.feature
		FROM temp_dataset_join_result z
		ORDER by z.zone_id ASC
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
        WHERE n.tdei_dataset_id = destination_dataset_id
		ORDER by n.id ASC
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
        WHERE n.tdei_dataset_id = destination_dataset_id
		ORDER by n.id ASC
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
        WHERE n.tdei_dataset_id = destination_dataset_id
		ORDER by n.id ASC
    LOOP
        edges := null;
		nodes := null;
		zones := null;
		extensions_points := null;
		extensions_lines := null;
		extensions_polygons := temp_row.feature::jsonb;
        RETURN NEXT;
    END LOOP;
END IF;

    -- Drop the temporary table
    DROP TABLE IF EXISTS temp_dataset_join_result;

    RETURN;
END;
$BODY$;