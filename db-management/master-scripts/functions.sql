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


CREATE OR REPLACE FUNCTION tdei_clone_dataset(
    clone_tdei_dataset_id text,
    to_tdei_project_group_id text,
    to_tdei_service_id text,
	new_metadata_json json,
	user_id text
)
RETURNS text AS $$
DECLARE
    new_tdei_dataset_id text;
BEGIN
	--Clone dataset
    INSERT INTO content.dataset (
        data_type,tdei_project_group_id,tdei_service_id,derived_from_dataset_id,
        dataset_url,metadata_url,changeset_url,osm_url,status,confidence_level,
        cm_version,cm_last_calculated_at,uploaded_timestamp,updated_at,updated_by,
        uploaded_by,event_info,node_info,ext_point_info,ext_line_info,ext_polygon_info,
        latest_dataset_url,latest_osm_url,zone_info,metadata_json
    )
    SELECT 
        data_type,
        tdei_project_group_id = to_tdei_project_group_id, -- New tdei_project_group_id
        tdei_service_id = to_tdei_service_id, -- New tdei_service_id
        derived_from_dataset_id = clone_tdei_dataset_id, -- derived_from_dataset_id is set to the original dataset ID
        dataset_url,metadata_url,changeset_url,osm_url,status,confidence_level,
        cm_version,cm_last_calculated_at,
		CURRENT_TIMESTAMP, --uploaded_timestamp
		CURRENT_TIMESTAMP, --updated_at
        user_id, -- updated_by
		user_id, -- uploaded_by
        event_info,node_info,ext_point_info,ext_line_info,ext_polygon_info,
        latest_dataset_url,latest_osm_url,zone_info,
        new_metadata_json::json -- new metadata json
    FROM content.dataset
    WHERE tdei_dataset_id = clone_tdei_dataset_id
    RETURNING tdei_dataset_id INTO new_tdei_dataset_id;
	
    RETURN new_tdei_dataset_id;
END;
$$ LANGUAGE plpgsql;


CREATE OR REPLACE FUNCTION tdei_clone_osw_data_elements(
    clone_tdei_dataset_id text,
	target_tdei_dataset_id text,
	user_id text
)
RETURNS void AS $$
BEGIN
	--Clone edge
    INSERT INTO content.edge (
        tdei_dataset_id, feature, created_at, requested_by, updated_at, updated_by
    )
    SELECT 
        target_tdei_dataset_id, -- New tdei_dataset_id
        feature,
		CURRENT_TIMESTAMP, --created_at
        user_id, -- updated_by
		CURRENT_TIMESTAMP, --updated_at
        user_id -- updated_by
    FROM content.edge
    WHERE tdei_dataset_id = clone_tdei_dataset_id;
	
	--Clone node
    INSERT INTO content.node (
        tdei_dataset_id, feature, created_at, requested_by, updated_at, updated_by
    )
    SELECT 
        target_tdei_dataset_id, -- New tdei_dataset_id
        feature,
		CURRENT_TIMESTAMP, --created_at
        user_id, -- updated_by
		CURRENT_TIMESTAMP, --updated_at
        user_id -- updated_by
    FROM content.node
    WHERE tdei_dataset_id = clone_tdei_dataset_id;
	
	--Clone zone
    INSERT INTO content.zone (
        tdei_dataset_id, feature, created_at, requested_by, updated_at, updated_by
    )
    SELECT 
        target_tdei_dataset_id, -- New tdei_dataset_id
        feature,
		CURRENT_TIMESTAMP, --created_at
        user_id, -- updated_by
		CURRENT_TIMESTAMP, --updated_at
        user_id -- updated_by
    FROM content.zone
    WHERE tdei_dataset_id = clone_tdei_dataset_id;
	
	--Clone extension_line
    INSERT INTO content.extension_line (
        tdei_dataset_id, feature, created_at, requested_by, updated_at, updated_by
    )
    SELECT 
        target_tdei_dataset_id, -- New tdei_dataset_id
        feature,
		CURRENT_TIMESTAMP, --created_at
        user_id, -- updated_by
		CURRENT_TIMESTAMP, --updated_at
        user_id -- updated_by
    FROM content.extension_line
    WHERE tdei_dataset_id = clone_tdei_dataset_id;
	
	--Clone extension_point
    INSERT INTO content.extension_point (
        tdei_dataset_id, feature, created_at, requested_by, updated_at, updated_by
    )
    SELECT 
        target_tdei_dataset_id, -- New tdei_dataset_id
        feature,
		CURRENT_TIMESTAMP, --created_at
        user_id, -- updated_by
		CURRENT_TIMESTAMP, --updated_at
        user_id -- updated_by
    FROM content.extension_point
    WHERE tdei_dataset_id = clone_tdei_dataset_id;
	
	--Clone extension_polygon
    INSERT INTO content.extension_polygon (
        tdei_dataset_id, feature, created_at, requested_by, updated_at, updated_by
    )
    SELECT 
        target_tdei_dataset_id, -- New tdei_dataset_id
        feature,
		CURRENT_TIMESTAMP, --created_at
        user_id, -- updated_by
		CURRENT_TIMESTAMP, --updated_at
        user_id -- updated_by
    FROM content.extension_polygon
    WHERE tdei_dataset_id = clone_tdei_dataset_id;
END;
$$ LANGUAGE plpgsql;