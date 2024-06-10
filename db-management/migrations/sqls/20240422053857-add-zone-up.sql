ALTER TABLE IF EXISTS content.dataset
    ADD COLUMN zone_info json;

CREATE FUNCTION content.zone_extract_w_id(json_data JSON) RETURNS bigint[]
AS $$
    SELECT ARRAY(
        SELECT CAST(value AS bigint)
        FROM JSON_ARRAY_ELEMENTS_TEXT(json_data->'properties'->'_w_id') AS elements(value)
    );
$$ LANGUAGE SQL IMMUTABLE;


CREATE TABLE IF NOT EXISTS content.zone
(   
    id bigint NOT NULL GENERATED ALWAYS AS IDENTITY ( INCREMENT 1 START 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 ),
    tdei_dataset_id character varying(40) COLLATE pg_catalog."default" NOT NULL,
    feature json NOT NULL,
    zone_loc geometry(Polygon, 4326) GENERATED ALWAYS AS (ST_SetSRID(ST_GeomFromGeoJSON(feature->>'geometry'), 4326)) STORED,
	zone_id bigint GENERATED ALWAYS AS ((feature->'properties'->>'_id')::bigint) STORED,
	node_ids bigint[] GENERATED ALWAYS AS (content.zone_extract_w_id(feature)) STORED,
    name character varying GENERATED ALWAYS AS ((feature->'properties'->>'name')::text) STORED,
    description character varying GENERATED ALWAYS AS ((feature->'properties'->>'description')::text) STORED,
	highway character varying GENERATED ALWAYS AS ((feature->'properties'->>'highway')::text) STORED,
	surface character varying GENERATED ALWAYS AS ((feature->'properties'->>'surface')::text) STORED,
	foot character varying GENERATED ALWAYS AS ((feature->'properties'->>'foot')::text) STORED,
    created_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    requested_by character varying(40) COLLATE pg_catalog."default",
   CONSTRAINT "PK_zone_id" PRIMARY KEY (id),
    CONSTRAINT unq_dataset_zone_id UNIQUE (tdei_dataset_id, zone_id)
);

CREATE INDEX IF NOT EXISTS idx_zone_location
    ON content.zone USING gist
    (zone_loc);


DROP FUNCTION content.bbox_intersect(character varying,numeric,numeric,numeric,numeric);
CREATE OR REPLACE FUNCTION content.bbox_intersect(
	dataset_id character varying(40),
    x_min_param DECIMAL,
    y_min_param DECIMAL,
    x_max_param DECIMAL,
    y_max_param DECIMAL
)
    RETURNS TABLE(edges json, nodes json, zones json, extensions_points json, extensions_lines json, extensions_polygons json) 
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
        edges := temp_row.feature;
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
		nodes := temp_row.feature;
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
        WHERE n.tdei_dataset_id = dataset_id AND ST_Intersects(n.point_loc, ST_MakeEnvelope(x_min_param, y_min_param, x_max_param, y_max_param, 4326))
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
        WHERE n.tdei_dataset_id = dataset_id AND ST_Intersects(n.line_loc, ST_MakeEnvelope(x_min_param, y_min_param, x_max_param, y_max_param, 4326))
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
        WHERE n.tdei_dataset_id = dataset_id AND ST_Intersects(n.polygon_loc, ST_MakeEnvelope(x_min_param, y_min_param, x_max_param, y_max_param, 4326))
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
	
    -- Drop the temporary table
    DROP TABLE IF EXISTS temp_intersected_edges;
    DROP TABLE IF EXISTS temp_intersected_zones;

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

     -- Delete records from content.zone
    DELETE FROM content.zone z WHERE z.tdei_dataset_id = delete_dataset_records_by_id.tdei_dataset_id;

    -- Delete records from content.extension_line
    DELETE FROM content.extension_line l WHERE l.tdei_dataset_id = delete_dataset_records_by_id.tdei_dataset_id;

    -- Delete records from content.extension_point
    DELETE FROM content.extension_point p WHERE p.tdei_dataset_id = delete_dataset_records_by_id.tdei_dataset_id;

    -- Delete records from content.extension_polygon
    DELETE FROM content.extension_polygon po WHERE po.tdei_dataset_id = delete_dataset_records_by_id.tdei_dataset_id;
END;
$$
LANGUAGE plpgsql;


DROP FUNCTION content.extract_dataset(character varying);
CREATE OR REPLACE FUNCTION content.extract_dataset(dataset_id character varying)
    RETURNS TABLE(edges json, nodes json, zones json, extensions_points json, extensions_lines json, extensions_polygons json) 
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
		WHERE tdei_dataset_id = dataset_id
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
	
    -- Pull all the point extension matching dataset_id
	FOR temp_row IN
        SELECT z.feature
        FROM content.zone z
        WHERE z.tdei_dataset_id = dataset_id
		ORDER by z.zone_id ASC
    LOOP
        edges := null;
		nodes := null;
        zones := temp_row.feature;
		extensions_points := null;
		extensions_lines := null;
		extensions_polygons := null;
        RETURN NEXT;
    END LOOP;

	-- Pull all the point extension matching dataset_id
	FOR temp_row IN
        SELECT n.feature
        FROM content.extension_point n
        WHERE n.tdei_dataset_id = dataset_id
		ORDER by n.point_id ASC
    LOOP
        edges := null;
		nodes := null;
        zones  := null;
		extensions_points := temp_row.feature;
		extensions_lines := null;
		extensions_polygons := null;
        RETURN NEXT;
    END LOOP;

	-- Pull all the line extension matching dataset_id
	FOR temp_row IN
        SELECT n.feature
        FROM content.extension_line n
        WHERE n.tdei_dataset_id = dataset_id
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
	
	-- Pull all the polygon extension matching dataset_id
	FOR temp_row IN
        SELECT n.feature
        FROM content.extension_polygon n
        WHERE n.tdei_dataset_id = dataset_id
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

    RETURN;
END;
$BODY$;