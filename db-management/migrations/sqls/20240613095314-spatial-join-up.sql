-- SELECT r.*, jsonb_set(
--         r.feature::jsonb, 
--         '{properties}', 
--         r.feature::jsonb->'properties' || jsonb_build_object(
--             'ext:S_highway', array_agg(s.highway),
--             'ext:new_property1', 'value1', -- replace with your desired value
--             'ext:new_property2', 'value2', -- replace with your desired value
--             'ext:new_property3', 'value3', -- replace with your desired value
--             'ext:new_property4', 'value4', -- replace with your desired value
--             'ext:new_property5', 'value5'  -- replace with your desired value
--         ), 
--         true
--     ) AS updated_feature
-- FROM content.edge r
-- INNER JOIN content.extension_point s on ST_Intersects(ST_Buffer(ST_Transform(r.edge_loc, 3857), 5, 'endcap=flat'), ST_Transform(s.point_loc, 3857))
-- WHERE r.tdei_dataset_id = '60a3df2e7a5046eb9fdcbab904980b6f' AND s.tdei_dataset_id = '0d661b69495d47fb838862edf699fe09' 
-- AND R.highway='footway' AND R.footway='sidewalk'  AND S.highway = 'street_lamp'
-- GROUP BY r.id,s.id, R.tdei_dataset_id,r.highway,R.edge_loc, s.tdei_dataset_id, s.point_loc


CREATE OR REPLACE FUNCTION content.tdei_dataset_spatial_join(
    destination_dataset_id text,
	dynamic_query text,
    destination_element text
)
RETURNS TABLE(edges json, nodes json, zones json, extensions_points json, extensions_lines json, extensions_polygons json)
LANGUAGE plpgsql
AS $$
DECLARE
    temp_row RECORD;
BEGIN

    -- Execute the dynamic query to create a temporary table
    EXECUTE 'CREATE TEMP TABLE temp_dataset_join_result AS ' || dynamic_query;

IF destination_element = 'edge' THEN
    -- Iterate over intersected edges
    FOR temp_row IN
        SELECT feature
        FROM temp_dataset_join_result
    LOOP
        edges := temp_row.feature;
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
        JOIN (
            SELECT orig_node_id AS node_id FROM temp_dataset_join_result
            UNION ALL
            SELECT dest_node_id AS node_id FROM temp_dataset_join_result
        ) e ON n.node_id = e.node_id
		WHERE n.tdei_dataset_id = destination_dataset_id
		ORDER BY n.node_id ASC
    LOOP
        edges := null;
		nodes := temp_row.feature;
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
        INNER JOIN temp_dataset_join_result ON ST_Intersects(z.zone_loc, temp_dataset_join_result.edge_loc)
	    WHERE z.tdei_dataset_id = destination_dataset_id
		ORDER by zone_id ASC
    LOOP
        edges := null;
		nodes := null;
		zones := temp_row.feature;
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
		ORDER by n.point_id ASC
    LOOP
         edges := null;
		nodes := null;
		zones := null;
		extensions_points := temp_row.feature;
		extensions_lines := null;
		extensions_polygons := null;
        RETURN NEXT;
    END LOOP;

	-- Pull all the line extension intersecting the bbox
	FOR temp_row IN
        SELECT n.feature
        FROM content.extension_line n
        WHERE n.tdei_dataset_id = destination_dataset_id
		ORDER by line_id ASC
    LOOP
         edges := null;
		nodes := null;
		zones := null;
		extensions_points := null;
		extensions_lines := temp_row.feature;
		extensions_polygons := null;
        RETURN NEXT;
    END LOOP;
	
	-- Pull all the polygon extension intersecting the bbox
	FOR temp_row IN
        SELECT n.feature
        FROM content.extension_polygon n
        WHERE n.tdei_dataset_id = destination_dataset_id
		ORDER by polygon_id ASC
    LOOP
        edges := null;
		nodes := null;
		zones := null;
		extensions_points := null;
		extensions_lines := null;
		extensions_polygons := temp_row.feature;
        RETURN NEXT;
    END LOOP;
END IF;
	
IF destination_element = 'node' THEN

    CREATE TEMP TABLE temp_intersected_edges AS
    SELECT e.orig_node_id, e.dest_node_id, e.feature, e.edge_loc
    FROM content.edge e
    INNER JOIN temp_dataset_join_result node ON e.orig_node_id = node.node_id OR e.dest_node_id = node.node_id
	WHERE e.tdei_dataset_id = destination_dataset_id
    ORDER by edge_id ASC;

    -- Iterate over intersected edges
    FOR temp_row IN
        SELECT feature
        FROM content.temp_intersected_edges e
    LOOP
        edges := temp_row.feature;
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
        FROM temp_dataset_join_result n
		ORDER BY n.node_id ASC
    LOOP
        edges := null;
		nodes := temp_row.feature;
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
        INNER JOIN temp_dataset_join_result ON ST_Intersects(z.zone_loc, temp_dataset_join_result.edge_loc)
	    WHERE z.tdei_dataset_id = destination_dataset_id
		ORDER by zone_id ASC
    LOOP
        edges := null;
		nodes := null;
		zones := temp_row.feature;
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
		ORDER by n.point_id ASC
    LOOP
         edges := null;
		nodes := null;
		zones := null;
		extensions_points := temp_row.feature;
		extensions_lines := null;
		extensions_polygons := null;
        RETURN NEXT;
    END LOOP;

	-- Pull all the line extension intersecting the bbox
	FOR temp_row IN
        SELECT n.feature
        FROM content.extension_line n
        WHERE n.tdei_dataset_id = destination_dataset_id
		ORDER by line_id ASC
    LOOP
         edges := null;
		nodes := null;
		zones := null;
		extensions_points := null;
		extensions_lines := temp_row.feature;
		extensions_polygons := null;
        RETURN NEXT;
    END LOOP;
	
	-- Pull all the polygon extension intersecting the bbox
	FOR temp_row IN
        SELECT n.feature
        FROM content.extension_polygon n
        WHERE n.tdei_dataset_id = destination_dataset_id
		ORDER by polygon_id ASC
    LOOP
        edges := null;
		nodes := null;
		zones := null;
		extensions_points := null;
		extensions_lines := null;
		extensions_polygons := temp_row.feature;
        RETURN NEXT;
    END LOOP;
END IF;

IF destination_element = 'zone' THEN
    -- Iterate over intersected edges
    FOR temp_row IN
        SELECT feature
        FROM content.edge e
        INNER JOIN temp_dataset_join_result z ON ST_Intersects(z.zone_loc, e.edge_loc)
        WHERE e.tdei_dataset_id = destination_dataset_id
		ORDER BY e.edge_id ASC
    LOOP
        edges := temp_row.feature;
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
        JOIN (
            SELECT unnest(node_ids) FROM temp_dataset_join_result
        ) e ON n.node_id = e.node_id
		WHERE n.tdei_dataset_id = destination_dataset_id
		ORDER BY n.node_id ASC
    LOOP
        edges := null;
		nodes := temp_row.feature;
		zones := null;
		extensions_points := null;
		extensions_lines := null;
		extensions_polygons := null;
        RETURN NEXT;
    END LOOP;

       -- Pull all the zone intersecting the bbox
	FOR temp_row IN
     	SELECT z.feature
		FROM temp_dataset_join_result z
		ORDER by zone_id ASC
    LOOP
        edges := null;
		nodes := null;
		zones := temp_row.feature;
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
		ORDER by n.point_id ASC
    LOOP
        edges := null;
		nodes := null;
		zones := null;
		extensions_points := temp_row.feature;
		extensions_lines := null;
		extensions_polygons := null;
        RETURN NEXT;
    END LOOP;

	-- Pull all the line extension intersecting the bbox
	FOR temp_row IN
        SELECT n.feature
        FROM content.extension_line n
        WHERE n.tdei_dataset_id = destination_dataset_id
		ORDER by line_id ASC
    LOOP
         edges := null;
		nodes := null;
		zones := null;
		extensions_points := null;
		extensions_lines := temp_row.feature;
		extensions_polygons := null;
        RETURN NEXT;
    END LOOP;
	
	-- Pull all the polygon extension intersecting the bbox
	FOR temp_row IN
        SELECT n.feature
        FROM content.extension_polygon n
        WHERE n.tdei_dataset_id = destination_dataset_id
		ORDER by polygon_id ASC
    LOOP
        edges := null;
		nodes := null;
		zones := null;
		extensions_points := null;
		extensions_lines := null;
		extensions_polygons := temp_row.feature;
        RETURN NEXT;
    END LOOP;
END IF;

    -- Drop the temporary table
    DROP TABLE IF EXISTS temp_dataset_join_result;

    RETURN;
END;
$$;