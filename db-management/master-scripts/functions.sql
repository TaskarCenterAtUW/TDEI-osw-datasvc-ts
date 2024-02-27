CREATE OR REPLACE FUNCTION content.bbox_intersect(
	dataset_id character varying(40),
    x_min_param DECIMAL,
    y_min_param DECIMAL,
    x_max_param DECIMAL,
    y_max_param DECIMAL
)
RETURNS TABLE(edges json, nodes json, extensions_points json, extensions_lines json, extensions_polygons json)
LANGUAGE plpgsql
AS $$
DECLARE
    temp_row RECORD;
BEGIN
    -- Create temporary table to store intersected edges
    CREATE TEMP TABLE temp_intersected_edges AS
    SELECT e.orig_node_id, e.dest_node_id, e.feature
    FROM content.edge e
    WHERE e.tdei_dataset_id = dataset_id AND ST_Intersects(e.edge_loc, ST_MakeEnvelope(x_min_param, y_min_param, x_max_param, y_max_param, 4326))
	ORDER by edge_id ASC;

    -- Iterate over intersected edges
    FOR temp_row IN
        SELECT feature
        FROM temp_intersected_edges
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
        JOIN (
            SELECT orig_node_id AS node_id FROM temp_intersected_edges
            UNION ALL
            SELECT dest_node_id AS node_id FROM temp_intersected_edges
        ) e ON n.node_id = e.node_id
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
        WHERE n.tdei_dataset_id = dataset_id AND ST_Intersects(n.point_loc, ST_MakeEnvelope(x_min_param, y_min_param, x_max_param, y_max_param, 4326))
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
        WHERE n.tdei_dataset_id = dataset_id AND ST_Intersects(n.line_loc, ST_MakeEnvelope(x_min_param, y_min_param, x_max_param, y_max_param, 4326))
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
        WHERE n.tdei_dataset_id = dataset_id AND ST_Intersects(n.polygon_loc, ST_MakeEnvelope(x_min_param, y_min_param, x_max_param, y_max_param, 4326))
		ORDER by polygon_id ASC
    LOOP
        edges := null;
		nodes := null;
		extensions_points := null;
		extensions_lines := null;
		extensions_polygons := temp_row.feature;
        RETURN NEXT;
    END LOOP;
	
    -- Drop the temporary table
    DROP TABLE IF EXISTS temp_intersected_edges;

    RETURN;
END;
$$;


CREATE OR REPLACE FUNCTION delete_dataset_records_by_id(tdei_dataset_id character varying(40)) RETURNS VOID AS
$$
BEGIN
    -- Delete records from content.edge
    DELETE FROM content.edge e WHERE e.tdei_dataset_id = delete_dataset_records_by_id.tdei_dataset_id;

    -- Delete records from content.node
    DELETE FROM content.node n WHERE n.tdei_dataset_id = delete_dataset_records_by_id.tdei_dataset_id;

    -- Delete records from content.extension_line
    DELETE FROM content.extension_line l WHERE l.tdei_dataset_id = delete_dataset_records_by_id.tdei_dataset_id;

    -- Delete records from content.extension_point
    DELETE FROM content.extension_point p WHERE p.tdei_dataset_id = delete_dataset_records_by_id.tdei_dataset_id;

    -- Delete records from content.extension_polygon
    DELETE FROM content.extension_polygon po WHERE po.tdei_dataset_id = delete_dataset_records_by_id.tdei_dataset_id;
END;
$$
LANGUAGE plpgsql;