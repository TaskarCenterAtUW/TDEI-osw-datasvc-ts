
CREATE OR REPLACE FUNCTION content.export_osm_xml(
	dataset_id text)
    RETURNS SETOF text 
    LANGUAGE 'plpgsql'
    COST 100
    VOLATILE PARALLEL UNSAFE
    ROWS 1000

AS $BODY$
DECLARE
    line_ex TEXT;
    operation_start_time timestamp;
BEGIN
    operation_start_time := clock_timestamp();
    -- Temporary table to store the dataset to export
    -- Purpose: Filters the dataset by tdei_dataset_id for subsequent joins
    CREATE TEMPORARY TABLE temp_datasettoexport (
        tdei_dataset_id TEXT PRIMARY KEY
    ) ON COMMIT DROP;
    INSERT INTO temp_datasettoexport
    SELECT d.tdei_dataset_id
    FROM content.dataset d
    WHERE d.tdei_dataset_id = dataset_id;
    -- Index to optimize joins on tdei_dataset_id
    -- Reason: Ensures fast lookups when joining with other tables
    CREATE INDEX idx_temp_datasettoexport ON temp_datasettoexport(tdei_dataset_id);
    RAISE NOTICE 'processing datasettoexport() completed in {%}', clock_timestamp() - operation_start_time;

    operation_start_time := clock_timestamp();
    -- Temporary table for parsed nodes
    -- Purpose: Stores node data with geometry and JSON properties for OSM node elements
    CREATE TEMPORARY TABLE temp_parsed_nodes (
        node_id VARCHAR,
        geom GEOMETRY(POINT, 4326),
        lat NUMERIC,
        lon NUMERIC,
        feature_json JSONB
    ) ON COMMIT DROP;
    INSERT INTO temp_parsed_nodes
    SELECT 
        -- (ABS(hashtextextended(n.node_id || ST_Y(n.node_loc)::NUMERIC || ST_X(n.node_loc)::NUMERIC, 987654321)))::VARCHAR,
		n.node_id,
        n.node_loc AS geom,
        ST_Y(n.node_loc)::NUMERIC AS lat,
        ST_X(n.node_loc)::NUMERIC AS lon,
        n.feature::JSONB AS feature_json
    FROM content.node n
    JOIN temp_datasettoexport d ON n.tdei_dataset_id = d.tdei_dataset_id;
    -- Spatial index to optimize ST_DWithin queries
    -- Reason: Speeds up spatial joins for node deduplication
    CREATE INDEX idx_temp_parsed_nodes_geom ON temp_parsed_nodes USING GIST (geom);
    -- Index on node_id for fast lookups
    -- Reason: Optimizes joins and filtering by node_id
    CREATE INDEX idx_temp_parsed_nodes_node_id ON temp_parsed_nodes(node_id);
    RAISE NOTICE 'processing temp_parsed_nodes() {%}', clock_timestamp() - operation_start_time;

    operation_start_time := clock_timestamp();
    -- Temporary table for raw edges
    -- Purpose: Stores edge data with JSON properties for OSM way elements
    CREATE TEMPORARY TABLE temp_raw_edges (
        edge_id VARCHAR,
        feature_json JSONB
    ) ON COMMIT DROP;
    INSERT INTO temp_raw_edges
    SELECT
        e.edge_id,
        e.feature::JSONB AS feature_json
    FROM content.edge e
    JOIN temp_datasettoexport d ON e.tdei_dataset_id = d.tdei_dataset_id;
    -- Index on edge_id for fast lookups
    -- Reason: Optimizes joins with edge points
    CREATE INDEX idx_temp_raw_edges_edge_id ON temp_raw_edges(edge_id);
    RAISE NOTICE 'processing temp_raw_edges() {%}', clock_timestamp() - operation_start_time;

    operation_start_time := clock_timestamp();
    -- Temporary table for edge points
    -- Purpose: Extracts individual coordinates from edge geometries
    CREATE TEMPORARY TABLE temp_edge_points (
        edge_id VARCHAR,
        point_index BIGINT,
        lon TEXT,
        lat TEXT,
        geom GEOMETRY(POINT, 4326)
    ) ON COMMIT DROP;
    INSERT INTO temp_edge_points
    SELECT
        el.edge_id,
        coords_index AS point_index,
        coords->>0 AS lon,
        coords->>1 AS lat,
        ST_SetSRID(ST_MakePoint((coords->>0)::DOUBLE PRECISION, (coords->>1)::DOUBLE PRECISION), 4326) AS geom
    FROM temp_raw_edges el,
        jsonb_array_elements(el.feature_json::jsonb #> '{geometry,coordinates}') WITH ORDINALITY AS coords(coords, coords_index);
    -- Index on edge_id for grouping and joins
    -- Reason: Speeds up queries that group or join by edge_id
    CREATE INDEX idx_temp_edge_points_edge_id ON temp_edge_points(edge_id);
    -- Spatial index for geometry-based queries
    -- Reason: Optimizes ST_DWithin for node deduplication
    CREATE INDEX idx_temp_edge_points_geom ON temp_edge_points USING GIST (geom);
    RAISE NOTICE 'processing temp_edge_points() {%}', clock_timestamp() - operation_start_time;

    operation_start_time := clock_timestamp();
    -- Temporary table for parsed edge points with node IDs
    -- Purpose: Maps edge points to existing or new node IDs for OSM ways
    CREATE TEMPORARY TABLE temp_parsed_edge_points (
        edge_id VARCHAR,
        point_index BIGINT,
        lon TEXT,
        lat TEXT,
        geom GEOMETRY(POINT, 4326),
        final_node_id VARCHAR,
        is_new BOOLEAN
    ) ON COMMIT DROP;
    INSERT INTO temp_parsed_edge_points
    SELECT 
        ep.*,
        COALESCE(
            pn.node_id, 
			-- (ABS(hashtextextended(ep.edge_id || ep.point_index || ep.lat || ep.lon, 987654321)))::VARCHAR
			(ep.edge_id || ep.point_index)::VARCHAR
        ) AS final_node_id,
        pn.node_id IS NULL AS is_new
    FROM temp_edge_points ep
    LEFT JOIN temp_parsed_nodes pn
	    -- ON ST_DWithin(ST_SetSRID(ST_MakePoint(ep.lon::DOUBLE PRECISION, ep.lat::DOUBLE PRECISION), 4326), pn.geom, 1e-9);
        -- ON ST_DWithin(ep.geom, pn.geom, 1e-9);
		ON ROUND(ep.lat::NUMERIC, 7) = ROUND(pn.lat, 7)
    AND ROUND(ep.lon::NUMERIC, 7) = ROUND(pn.lon, 7);
    -- Index on edge_id for grouping
    -- Reason: Optimizes grouping by edge_id for way creation
    CREATE INDEX idx_temp_parsed_edge_points_edge_id ON temp_parsed_edge_points(edge_id);
    -- Index on final_node_id for joins
    -- Reason: Speeds up queries referencing node IDs in ways
    CREATE INDEX idx_temp_parsed_edge_points_final_node_id ON temp_parsed_edge_points(final_node_id);
    RAISE NOTICE 'processing temp_parsed_edge_points() {%}', clock_timestamp() - operation_start_time;

    operation_start_time := clock_timestamp();
    -- Temporary table for extension points
    -- Purpose: Stores extension point data with JSON properties
    CREATE TEMPORARY TABLE temp_extension_points (
        point_id VARCHAR,
        lat NUMERIC,
        lon NUMERIC,
        feature_json JSONB
    ) ON COMMIT DROP;
    INSERT INTO temp_extension_points
    SELECT 
        n.point_id,
        ST_Y(point_loc)::NUMERIC AS lat,
        ST_X(point_loc)::NUMERIC AS lon,
        n.feature::JSONB AS feature_json
    FROM content.extension_point n
    JOIN temp_datasettoexport d ON n.tdei_dataset_id = d.tdei_dataset_id;
    -- Index on point_id for lookups
    -- Reason: Optimizes filtering and joins by point_id
    CREATE INDEX idx_temp_extension_points_point_id ON temp_extension_points(point_id);
    RAISE NOTICE 'processing temp_extension_points() {%}', clock_timestamp() - operation_start_time;

    operation_start_time := clock_timestamp();
    -- Temporary table for parsed extension points
    -- Purpose: Merges extension points with nodes, assigning unique node IDs
    CREATE TEMPORARY TABLE temp_parsed_extension_points (
        is_new BOOLEAN,
        final_node_id VARCHAR,
        lat NUMERIC,
        lon NUMERIC,
        feature_json JSONB
    ) ON COMMIT DROP;
    INSERT INTO temp_parsed_extension_points
    SELECT 
        true AS is_new,
        -- COALESCE( NULL, ( ABS( hashtextextended(pp.point_id || pp.lat || pp.lon, 987654321) ))::VARCHAR ) AS final_node_id,
		pp.point_id AS final_node_id,
        pp.lat,
        pp.lon,
        jsonb_build_object(
            'type', 'Feature',
            'geometry', jsonb_build_object(
                'type', 'Point',
                'coordinates', jsonb_build_array(pp.lon, pp.lat)
            ),
            'properties',
            (
                -- COALESCE((pn.feature_json->'properties'), '{}'::JSONB) - '_id' || 
                COALESCE((pp.feature_json->'properties'), '{}'::JSONB) - '_id' ||
                -- jsonb_build_object('_id', COALESCE( NULL, (ABS( hashtextextended(pp.point_id || pp.lat || pp.lon, 987654321)))::VARCHAR ))
				jsonb_build_object('_id', pp.point_id ))
            
        ) AS feature_json
    FROM temp_extension_points pp;
   
    -- Index on final_node_id for joins
    -- Reason: Optimizes references to node IDs in OSM output
    CREATE INDEX idx_temp_parsed_extension_points_final_node_id ON temp_parsed_extension_points(final_node_id);
    RAISE NOTICE 'processing temp_parsed_extension_points() {%}', clock_timestamp() - operation_start_time;

    operation_start_time := clock_timestamp();
    -- Temporary table for raw extension lines
    -- Purpose: Stores extension line data with JSON properties
    CREATE TEMPORARY TABLE temp_raw_extension_lines (
        line_id VARCHAR,
        feature_json JSONB
    ) ON COMMIT DROP;
    INSERT INTO temp_raw_extension_lines
    SELECT
        el.line_id,
        el.feature::JSONB AS feature_json
    FROM content.extension_line el
    JOIN temp_datasettoexport d ON el.tdei_dataset_id = d.tdei_dataset_id;
    -- Index on line_id for lookups
    -- Reason: Speeds up joins with line points
    CREATE INDEX idx_temp_raw_extension_lines_line_id ON temp_raw_extension_lines(line_id);
    RAISE NOTICE 'processing temp_raw_extension_lines() {%}', clock_timestamp() - operation_start_time;

    operation_start_time := clock_timestamp();
    -- Temporary table for extension line points
    -- Purpose: Extracts coordinates from extension line geometries
    CREATE TEMPORARY TABLE temp_extension_lines_points (
        line_id VARCHAR,
        point_index BIGINT,
        lon TEXT,
        lat TEXT,
        geom GEOMETRY(POINT, 4326)
    ) ON COMMIT DROP;
    INSERT INTO temp_extension_lines_points
    SELECT
        el.line_id,
        coords_index AS point_index,
        coords->>0 AS lon,
        coords->>1 AS lat,
        ST_SetSRID(ST_MakePoint((coords->>0)::DOUBLE PRECISION, (coords->>1)::DOUBLE PRECISION), 4326) AS geom
    FROM temp_raw_extension_lines el,
        jsonb_array_elements(el.feature_json #> '{geometry,coordinates}') WITH ORDINALITY AS coords(coords, coords_index);
    -- Index on line_id for grouping
    -- Reason: Optimizes grouping by line_id for way creation
    CREATE INDEX idx_temp_extension_lines_points_line_id ON temp_extension_lines_points(line_id);
    -- Spatial index for geometry-based queries
    -- Reason: Speeds up ST_DWithin for node deduplication
    CREATE INDEX idx_temp_extension_lines_points_geom ON temp_extension_lines_points USING GIST (geom);
    RAISE NOTICE 'processing temp_extension_lines_points() {%}', clock_timestamp() - operation_start_time;

    operation_start_time := clock_timestamp();
    -- Temporary table for parsed extension lines
    -- Purpose: Maps extension line points to node IDs for OSM ways
    CREATE TEMPORARY TABLE temp_parsed_extension_lines (
        line_id VARCHAR,
        point_index BIGINT,
        lon TEXT,
        lat TEXT,
        geom GEOMETRY(POINT, 4326),
        final_node_id VARCHAR,
        is_new BOOLEAN
    ) ON COMMIT DROP;
    INSERT INTO temp_parsed_extension_lines
    SELECT
        ep.*,
        -- COALESCE(
        --     null,
        --     ( ABS(hashtextextended(ep.lat || ep.lon || ep.point_index || ep.line_id, 987654321)))::VARCHAR
        -- ) AS final_node_id,
		(ep.line_id || ep.point_index)::VARCHAR AS final_node_id,
        true AS is_new
    FROM temp_extension_lines_points ep;

    -- Index on line_id for grouping
    -- Reason: Optimizes grouping by line_id for way creation
    CREATE INDEX idx_temp_parsed_extension_lines_line_id ON temp_parsed_extension_lines(line_id);
    -- Index on final_node_id for joins
    -- Reason: Speeds up references to node IDs in ways
    CREATE INDEX idx_temp_parsed_extension_lines_final_node_id ON temp_parsed_extension_lines(final_node_id);
    RAISE NOTICE 'processing temp_parsed_extension_lines() {%}', clock_timestamp() - operation_start_time;

    operation_start_time := clock_timestamp();
    -- Temporary table for extension polygons
    -- Purpose: Stores polygon data with JSON properties
    CREATE TEMPORARY TABLE temp_extension_polygons (
        polygon_id VARCHAR,
        feature_json JSONB
    ) ON COMMIT DROP;
    INSERT INTO temp_extension_polygons
    SELECT 
        p.polygon_id,
        p.feature::JSONB AS feature_json
    FROM content.extension_polygon p
    JOIN temp_datasettoexport d ON p.tdei_dataset_id = d.tdei_dataset_id;
    -- Index on polygon_id for lookups
    -- Reason: Optimizes joins with polygon points
    CREATE INDEX idx_temp_extension_polygons_polygon_id ON temp_extension_polygons(polygon_id);
    RAISE NOTICE 'processing temp_extension_polygons() {%}', clock_timestamp() - operation_start_time;

    operation_start_time := clock_timestamp();
    -- Temporary table for single-ring polygons
    -- Purpose: Extracts coordinates from single-ring polygons
    CREATE TEMPORARY TABLE temp_single_ring_polygons (
        polygon_id VARCHAR,
        ring_index INTEGER,
        point_index BIGINT,
        lon TEXT,
        lat TEXT,
        is_multipolygon BOOLEAN,
        geom GEOMETRY(POINT, 4326)
    ) ON COMMIT DROP;
    INSERT INTO temp_single_ring_polygons
    SELECT 
        pf.polygon_id,
        1 AS ring_index,
        point_idx AS point_index,
        coord->>0 AS lon,
        coord->>1 AS lat,
        FALSE AS is_multipolygon,
        ST_SetSRID(ST_MakePoint((coord->>0)::DOUBLE PRECISION, (coord->>1)::DOUBLE PRECISION), 4326) AS geom
    FROM temp_extension_polygons pf
    CROSS JOIN LATERAL jsonb_array_elements(pf.feature_json #> '{geometry,coordinates,0}') WITH ORDINALITY AS coord(coord, point_idx)
    WHERE jsonb_array_length(pf.feature_json #> '{geometry,coordinates}') = 1;
    -- Index on polygon_id for grouping
    -- Reason: Optimizes grouping by polygon_id for way creation
    CREATE INDEX idx_temp_single_ring_polygons_polygon_id ON temp_single_ring_polygons(polygon_id);
    -- Spatial index for geometry-based queries
    -- Reason: Speeds up ST_DWithin for node deduplication
    CREATE INDEX idx_temp_single_ring_polygons_geom ON temp_single_ring_polygons USING GIST (geom);
    RAISE NOTICE 'processing temp_single_ring_polygons() {%}', clock_timestamp() - operation_start_time;

    operation_start_time := clock_timestamp();
    -- Temporary table for multi-ring polygons
    -- Purpose: Extracts coordinates from multi-ring polygons
    CREATE TEMPORARY TABLE temp_multi_ring_polygons (
        polygon_id VARCHAR,
        ring_index BIGINT,
        point_index BIGINT,
        lon TEXT,
        lat TEXT,
        is_multipolygon BOOLEAN,
        geom GEOMETRY(POINT, 4326)
    ) ON COMMIT DROP;
    INSERT INTO temp_multi_ring_polygons
    SELECT 
        pf.polygon_id,
        ring_idx,
        point_idx AS point_index,
        coord->>0 AS lon,
        coord->>1 AS lat,
        TRUE AS is_multipolygon,
        ST_SetSRID(ST_MakePoint((coord->>0)::DOUBLE PRECISION, (coord->>1)::DOUBLE PRECISION), 4326) AS geom
    FROM temp_extension_polygons pf
    CROSS JOIN LATERAL jsonb_array_elements(pf.feature_json #> '{geometry,coordinates}') WITH ORDINALITY AS ring(ring_coords, ring_idx)
    CROSS JOIN LATERAL jsonb_array_elements(ring_coords) WITH ORDINALITY AS coord(coord, point_idx)
    WHERE jsonb_array_length(pf.feature_json #> '{geometry,coordinates}') > 1;
    -- Index on polygon_id for grouping
    -- Reason: Optimizes grouping by polygon_id for way creation
    CREATE INDEX idx_temp_multi_ring_polygons_polygon_id ON temp_multi_ring_polygons(polygon_id);
    -- Spatial index for geometry-based queries
    -- Reason: Speeds up ST_DWithin for node deduplication
    CREATE INDEX idx_temp_multi_ring_polygons_geom ON temp_multi_ring_polygons USING GIST (geom);
    RAISE NOTICE 'processing temp_multi_ring_polygons() {%}', clock_timestamp() - operation_start_time;

    operation_start_time := clock_timestamp();
    -- Temporary table for flattened polygon coordinates
    -- Purpose: Combines single and multi-ring polygon coordinates
    CREATE TEMPORARY TABLE temp_flattened_polygon_coords (
        polygon_id VARCHAR,
        ring_index BIGINT,
        point_index BIGINT,
        lon TEXT,
        lat TEXT,
        is_multipolygon BOOLEAN,
        geom GEOMETRY(POINT, 4326)
    ) ON COMMIT DROP;
    INSERT INTO temp_flattened_polygon_coords
    SELECT * FROM temp_single_ring_polygons
    UNION ALL
    SELECT * FROM temp_multi_ring_polygons;
    -- Index on polygon_id for grouping
    -- Reason: Optimizes grouping by polygon_id for way creation
    CREATE INDEX idx_temp_flattened_polygon_coords_polygon_id ON temp_flattened_polygon_coords(polygon_id);
    -- Spatial index for geometry-based queries
    -- Reason: Speeds up ST_DWithin for node deduplication
    CREATE INDEX idx_temp_flattened_polygon_coords_geom ON temp_flattened_polygon_coords USING GIST (geom);
    RAISE NOTICE 'processing temp_flattened_polygon_coords() {%}', clock_timestamp() - operation_start_time;

    operation_start_time := clock_timestamp();
    -- Temporary table for parsed extension polygons
    -- Purpose: Maps polygon points to node IDs for OSM ways/relations
    CREATE TEMPORARY TABLE temp_parsed_extension_polygons (
        polygon_id VARCHAR,
        ring_index BIGINT,
        point_index BIGINT,
        lon TEXT,
        lat TEXT,
        is_multipolygon BOOLEAN,
        geom GEOMETRY(POINT, 4326),
        final_node_id VARCHAR,
        is_new BOOLEAN
    ) ON COMMIT DROP;
    INSERT INTO temp_parsed_extension_polygons
    SELECT 
        fc.*,
        -- (ABS(hashtextextended(fc.lat || fc.lon || fc.polygon_id , 987654321)))::VARCHAR AS final_node_id,
		(fc.polygon_id || point_index || ring_index || is_multipolygon)::VARCHAR AS final_node_id,
        true AS is_new
    FROM temp_flattened_polygon_coords fc;

    -- Index on polygon_id for grouping
    -- Reason: Optimizes grouping by polygon_id for way creation
    CREATE INDEX idx_temp_parsed_extension_polygons_polygon_id ON temp_parsed_extension_polygons(polygon_id);
    -- Index on final_node_id for joins
    -- Reason: Speeds up references to node IDs in ways/relations
    CREATE INDEX idx_temp_parsed_extension_polygons_final_node_id ON temp_parsed_extension_polygons(final_node_id);
    RAISE NOTICE 'processing temp_parsed_extension_polygons() {%}', clock_timestamp() - operation_start_time;

    operation_start_time := clock_timestamp();
    -- Temporary table for single-ring zones
    -- Purpose: Extracts coordinates from single-ring zones
    CREATE TEMPORARY TABLE temp_single_ring_zones (
        zone_id VARCHAR,
        ring_index INTEGER,
        point_index BIGINT,
        lon TEXT,
        lat TEXT,
        is_multipolygon BOOLEAN,
        geom GEOMETRY(POINT, 4326)
    ) ON COMMIT DROP;
    INSERT INTO temp_single_ring_zones
    SELECT 
        z.zone_id,
        1 AS ring_index,
        point_idx AS point_index,
        coord->>0 AS lon,
        coord->>1 AS lat,
        FALSE AS is_multipolygon,
        ST_SetSRID(ST_MakePoint((coord->>0)::DOUBLE PRECISION, (coord->>1)::DOUBLE PRECISION), 4326) AS geom
    FROM content.zone z
    JOIN temp_datasettoexport d ON z.tdei_dataset_id = d.tdei_dataset_id
    CROSS JOIN LATERAL jsonb_array_elements(z.feature::jsonb #> '{geometry,coordinates,0}') WITH ORDINALITY AS coord(coord, point_idx)
    WHERE jsonb_array_length(z.feature::jsonb #> '{geometry,coordinates}') = 1;
    -- Index on zone_id for grouping
    -- Reason: Optimizes grouping by zone_id for way creation
    CREATE INDEX idx_temp_single_ring_zones_zone_id ON temp_single_ring_zones(zone_id);
    -- Spatial index for geometry-based queries
    -- Reason: Speeds up ST_DWithin for node deduplication
    CREATE INDEX idx_temp_single_ring_zones_geom ON temp_single_ring_zones USING GIST (geom);
    RAISE NOTICE 'processing temp_single_ring_zones() {%}', clock_timestamp() - operation_start_time;

    operation_start_time := clock_timestamp();
    -- Temporary table for parsed zones
    -- Purpose: Stores zone data with JSON properties and multipolygon flag
    CREATE TEMPORARY TABLE temp_parsed_zones (
        zone_id VARCHAR,
        node_ids TEXT[],
        feature_json JSONB,
        is_multipolygon BOOLEAN
    ) ON COMMIT DROP;
    INSERT INTO temp_parsed_zones
    SELECT
        z.zone_id,
        z.node_ids,
        z.feature::JSONB AS feature_json,
        CASE
            WHEN JSONB_ARRAY_LENGTH(z.feature::JSONB #> '{geometry,coordinates}') > 1 THEN TRUE
            ELSE FALSE
        END AS is_multipolygon
    FROM content.zone z
    JOIN temp_datasettoexport d ON z.tdei_dataset_id = d.tdei_dataset_id;
    -- Index on zone_id for lookups
    -- Reason: Optimizes joins with zone points
    CREATE INDEX idx_temp_parsed_zones_zone_id ON temp_parsed_zones(zone_id);
    RAISE NOTICE 'processing temp_parsed_zones() {%}', clock_timestamp() - operation_start_time;

    operation_start_time := clock_timestamp();
    -- Temporary table for multi-ring zones
    -- Purpose: Extracts coordinates from multi-ring zones
    CREATE TEMPORARY TABLE temp_multi_ring_zones (
        zone_id VARCHAR,
        ring_index BIGINT,
        point_index BIGINT,
        lon TEXT,
        lat TEXT,
        is_multipolygon BOOLEAN,
        geom GEOMETRY(POINT, 4326)
    ) ON COMMIT DROP;
    INSERT INTO temp_multi_ring_zones
    SELECT 
        z.zone_id,
        ring_idx,
        point_idx AS point_index,
        coord->>0 AS lon,
        coord->>1 AS lat,
        TRUE AS is_multipolygon,
        ST_SetSRID(ST_MakePoint((coord->>0)::DOUBLE PRECISION, (coord->>1)::DOUBLE PRECISION), 4326) AS geom
    FROM content.zone z
    JOIN temp_datasettoexport d ON z.tdei_dataset_id = d.tdei_dataset_id
    CROSS JOIN LATERAL jsonb_array_elements(z.feature::jsonb #> '{geometry,coordinates}') WITH ORDINALITY AS ring(ring_coords, ring_idx)
    CROSS JOIN LATERAL jsonb_array_elements(ring_coords) WITH ORDINALITY AS coord(coord, point_idx)
    WHERE jsonb_array_length(z.feature::jsonb #> '{geometry,coordinates}') > 1;
    -- Index on zone_id for grouping
    -- Reason: Optimizes grouping by zone_id for way creation
    CREATE INDEX idx_temp_multi_ring_zones_zone_id ON temp_multi_ring_zones(zone_id);
    -- Spatial index for geometry-based queries
    -- Reason: Speeds up ST_DWithin for node deduplication
    CREATE INDEX idx_temp_multi_ring_zones_geom ON temp_multi_ring_zones USING GIST (geom);
    RAISE NOTICE 'processing temp_multi_ring_zones() {%}', clock_timestamp() - operation_start_time;

    operation_start_time := clock_timestamp();
    -- Temporary table for flattened zone coordinates
    -- Purpose: Combines single and multi-ring zone coordinates
    CREATE TEMPORARY TABLE temp_flattened_zone_coords (
        zone_id VARCHAR,
        ring_index BIGINT,
        point_index BIGINT,
        lon TEXT,
        lat TEXT,
        is_multipolygon BOOLEAN,
        geom GEOMETRY(POINT, 4326)
    ) ON COMMIT DROP;
    INSERT INTO temp_flattened_zone_coords
    SELECT * FROM temp_single_ring_zones
    UNION ALL
    SELECT * FROM temp_multi_ring_zones;
    -- Index on zone_id for grouping
    -- Reason: Optimizes grouping by zone_id for way creation
    CREATE INDEX idx_temp_flattened_zone_coords_zone_id ON temp_flattened_zone_coords(zone_id);
    -- Spatial index for geometry-based queries
    -- Reason: Speeds up ST_DWithin for node deduplication
    CREATE INDEX idx_temp_flattened_zone_coords_geom ON temp_flattened_zone_coords USING GIST (geom);
    RAISE NOTICE 'processing temp_flattened_zone_coords() {%}', clock_timestamp() - operation_start_time;

    operation_start_time := clock_timestamp();
    -- Temporary table for parsed zone polygons
    -- Purpose: Maps zone points to node IDs for OSM ways/relations
    CREATE TEMPORARY TABLE temp_parsed_zone_polygons (
        zone_id VARCHAR,
        ring_index BIGINT,
        point_index BIGINT,
        lon TEXT,
        lat TEXT,
        is_multipolygon BOOLEAN,
        geom GEOMETRY(POINT, 4326),
        final_node_id VARCHAR,
        is_new BOOLEAN
    ) ON COMMIT DROP;
    INSERT INTO temp_parsed_zone_polygons
    SELECT 
        fc.*,
        -- (ABS(hashtextextended(fc.lat || fc.lon || fc.zone_id, 987654321)))::VARCHAR AS final_node_id,
		(fc.zone_id || point_index || ring_index)::VARCHAR AS final_node_id,
        pn.node_id IS NULL AS is_new
    FROM temp_flattened_zone_coords fc
    LEFT JOIN temp_parsed_nodes pn 
        ON ST_DWithin(pn.geom, ST_SetSRID(ST_MakePoint(fc.lon::DOUBLE PRECISION, fc.lat::DOUBLE PRECISION), 4326), 1e-9);
    -- Index on zone_id for grouping
    -- Reason: Optimizes grouping by zone_id for way creation
    CREATE INDEX idx_temp_parsed_zone_polygons_zone_id ON temp_parsed_zone_polygons(zone_id);
    -- Index on final_node_id for joins
    -- Reason: Speeds up references to node IDs in ways/relations
    CREATE INDEX idx_temp_parsed_zone_polygons_final_node_id ON temp_parsed_zone_polygons(final_node_id);
    RAISE NOTICE 'processing temp_parsed_zone_polygons() {%}', clock_timestamp() - operation_start_time;

    operation_start_time := clock_timestamp();
    -- Temporary table for all nodes
    -- Purpose: Collects all nodes from various sources for deduplication
    CREATE TEMPORARY TABLE temp_all_nodes (
        node_id VARCHAR,
        lat NUMERIC,
        lon NUMERIC,
        feature_json JSONB
    ) ON COMMIT DROP;
    INSERT INTO temp_all_nodes
    SELECT node_id, CASE 
    WHEN position('.' IN lat::TEXT) > 0 AND length(split_part(lat::TEXT, '.', 2)) > 7
      THEN ROUND(lat::NUMERIC, 7)
    ELSE lat::NUMERIC
  END AS lat,
  CASE 
    WHEN position('.' IN lon::TEXT) > 0 AND length(split_part(lon::TEXT, '.', 2)) > 7
      THEN ROUND(lon::NUMERIC, 7)
    ELSE lon::NUMERIC
  END AS lon,  feature_json
    FROM temp_parsed_nodes
    UNION ALL
    SELECT final_node_id AS node_id, CASE 
    WHEN position('.' IN lat::TEXT) > 0 AND length(split_part(lat::TEXT, '.', 2)) > 7
      THEN ROUND(lat::NUMERIC, 7)
    ELSE lat::NUMERIC
  END AS lat,
  CASE 
    WHEN position('.' IN lon::TEXT) > 0 AND length(split_part(lon::TEXT, '.', 2)) > 7
      THEN ROUND(lon::NUMERIC, 7)
    ELSE lon::NUMERIC
  END AS lon, feature_json
    FROM temp_parsed_extension_points
    UNION ALL
    SELECT final_node_id AS node_id, CASE 
    WHEN position('.' IN lat::TEXT) > 0 AND length(split_part(lat::TEXT, '.', 2)) > 7
      THEN ROUND(lat::NUMERIC, 7)
    ELSE lat::NUMERIC
  END AS lat,
  CASE 
    WHEN position('.' IN lon::TEXT) > 0 AND length(split_part(lon::TEXT, '.', 2)) > 7
      THEN ROUND(lon::NUMERIC, 7)
    ELSE lon::NUMERIC
  END AS lon, NULL::JSONB AS feature_json
    FROM temp_parsed_extension_polygons
    UNION ALL
    SELECT final_node_id AS node_id, CASE 
    WHEN position('.' IN lat::TEXT) > 0 AND length(split_part(lat::TEXT, '.', 2)) > 7
      THEN ROUND(lat::NUMERIC, 7)
    ELSE lat::NUMERIC
  END AS lat,
  CASE 
    WHEN position('.' IN lon::TEXT) > 0 AND length(split_part(lon::TEXT, '.', 2)) > 7
      THEN ROUND(lon::NUMERIC, 7)
    ELSE lon::NUMERIC
  END AS lon, NULL::JSONB AS feature_json
    FROM temp_parsed_zone_polygons
    UNION ALL
    SELECT final_node_id AS node_id, CASE 
    WHEN position('.' IN lat::TEXT) > 0 AND length(split_part(lat::TEXT, '.', 2)) > 7
      THEN ROUND(lat::NUMERIC, 7)
    ELSE lat::NUMERIC
  END AS lat,
  CASE 
    WHEN position('.' IN lon::TEXT) > 0 AND length(split_part(lon::TEXT, '.', 2)) > 7
      THEN ROUND(lon::NUMERIC, 7)
    ELSE lon::NUMERIC
  END AS lon, NULL::JSONB AS feature_json
    FROM temp_parsed_extension_lines
    UNION ALL
    SELECT DISTINCT ON (final_node_id) final_node_id AS node_id, CASE 
    WHEN position('.' IN lat::TEXT) > 0 AND length(split_part(lat::TEXT, '.', 2)) > 7
      THEN ROUND(lat::NUMERIC, 7)
    ELSE lat::NUMERIC
  END AS lat,
  CASE 
    WHEN position('.' IN lon::TEXT) > 0 AND length(split_part(lon::TEXT, '.', 2)) > 7
      THEN ROUND(lon::NUMERIC, 7)
    ELSE lon::NUMERIC
  END AS lon, NULL::JSONB AS feature_json
    FROM temp_parsed_edge_points;
    -- Index on lat, lon for deduplication
    -- Reason: Optimizes grouping by coordinates for node deduplication
    CREATE INDEX idx_temp_all_nodes_lat_lon ON temp_all_nodes(lat, lon);
    -- Index on node_id for lookups
    -- Reason: Speeds up filtering and joins by node_id
    CREATE INDEX idx_temp_all_nodes_node_id ON temp_all_nodes(node_id);
    RAISE NOTICE 'processing temp_all_nodes() {%}', clock_timestamp() - operation_start_time;

    operation_start_time := clock_timestamp();
    -- Temporary table for deduplicated nodes
    -- Purpose: Ensures unique nodes based on coordinates for OSM output
    CREATE TEMPORARY TABLE temp_deduplicated_nodes (
        node_id VARCHAR,
        lat NUMERIC,
        lon NUMERIC,
        feature_json JSONB,
        CONSTRAINT unique_node_id UNIQUE (node_id)
    ) ON COMMIT DROP;
    INSERT INTO temp_deduplicated_nodes
    SELECT DISTINCT ON (node_id)
        node_id,
        lat,
        lon,
        feature_json
    FROM temp_all_nodes;
    -- Index on node_id for lookups
    -- Reason: Optimizes references to node IDs in OSM output
    CREATE INDEX idx_temp_deduplicated_nodes_node_id ON temp_deduplicated_nodes(node_id);
    -- Index on lat, lon for spatial queries
    -- Reason: Speeds up any additional spatial lookups
    CREATE INDEX idx_temp_deduplicated_nodes_lat_lon ON temp_deduplicated_nodes(lat, lon);
    RAISE NOTICE 'processing temp_deduplicated_nodes() {%}', clock_timestamp() - operation_start_time;

    operation_start_time := clock_timestamp();
    -- Temporary table for node XML blocks
    -- Purpose: Formats nodes as OSM XML elements
    CREATE TEMPORARY TABLE temp_node_blocks (
        line TEXT,
		eid varchar,
		seq_id bigint
    ) ON COMMIT DROP;
    INSERT INTO temp_node_blocks (line, eid, seq_id)
    SELECT
        CASE 
            WHEN (feature_json IS NOT NULL AND jsonb_typeof(feature_json->'properties') = 'object' AND (
                SELECT COUNT(*) 
                FROM jsonb_each_text(feature_json->'properties')
                WHERE key NOT IN ('_id', '_u_id', '_v_id', '_w_id')
            ) > 0)
            THEN '<node visible="true" version="1" id="' || node_id || '" lat="' || lat || '" lon="' || lon || '">' || (
                SELECT string_agg('<tag k="' || key || '" v="' || content.tdei_escape_xml_attr(value) || '"/>', E'')
                FROM jsonb_each_text(feature_json->'properties')
                WHERE key NOT IN ('_id', '_u_id', '_v_id', '_w_id')
            ) || '</node>'
            ELSE '<node visible="true" version="1" id="' || node_id || '" lat="' || lat || '" lon="' || lon || '"/>'
        END AS line,
		node_id as eid,
		0 as seq_id
    FROM temp_deduplicated_nodes;
	CREATE INDEX idx_temp_node_blocks_eid ON temp_node_blocks(eid);
	CREATE INDEX idx_temp_node_blocks_seq_id ON temp_node_blocks(seq_id);
    RAISE NOTICE 'processing temp_node_blocks() {%}', clock_timestamp() - operation_start_time;

    operation_start_time := clock_timestamp();
    -- Temporary table for edge way XML blocks
    -- Purpose: Formats edges as OSM way elements
    CREATE TEMPORARY TABLE temp_edge_way_blocks (
		eid VARCHAR,
		node_refs VARCHAR[],
        line TEXT
    ) ON COMMIT DROP;
    INSERT INTO temp_edge_way_blocks
    SELECT
		pep.edge_id as eid,
		ARRAY_AGG(final_node_id) as node_refs,
        '<way visible="true"  version="1" id="' || pep.edge_id || '">' ||
        STRING_AGG('<nd ref="' || final_node_id || '"/>', E'' ORDER BY point_index) ||
        COALESCE(
            (
                SELECT STRING_AGG('<tag k="' || Key || '" v="' || CASE 
                        WHEN key = 'width' THEN TO_CHAR(value::float8, 'FM999999990.0')::text
                        WHEN key = 'step_count' THEN CAST(value AS INTEGER)::TEXT
                        ELSE content.tdei_escape_xml_attr(value)
                    END || '"/>', E'')
                FROM jsonb_each_text((
                    SELECT re.feature_json
                    FROM temp_raw_edges re
                    WHERE re.edge_id = pep.edge_id
                    LIMIT 1
                ) -> 'properties')
                WHERE key NOT IN ('_id', '_v_id', '_u_id', 'length')
                  AND NOT (
                    key = 'foot' AND value = 'yes' AND (
                        (
                            (SELECT re.feature_json->'properties'->>'highway'
                             FROM temp_raw_edges re
                             WHERE re.edge_id = pep.edge_id
                             LIMIT 1)
                        ) IN ('footway', 'pedestrian', 'steps', 'living_street')
                    )
                  )
            ),
            ''
        ) ||
        '</way>' AS line
    FROM temp_parsed_edge_points pep
    GROUP BY pep.edge_id;
    -- Index on edge_id for lookups
    -- Reason: Optimizes filtering and joins by edge_id
    CREATE INDEX idx_temp_edge_way_blocks_edge_id ON temp_edge_way_blocks(eid);
    RAISE NOTICE 'processing temp_edge_way_blocks() {%}', clock_timestamp() - operation_start_time;

    operation_start_time := clock_timestamp();
    -- Temporary table for polygon way XML blocks
    -- Purpose: Formats polygons as OSM way elements
    CREATE TEMPORARY TABLE temp_polygon_way_blocks (
        polygon_id VARCHAR,
        ring_index BIGINT,
		eid VARCHAR,
		node_refs VARCHAR[],
        line TEXT
    ) ON COMMIT DROP;
    INSERT INTO temp_polygon_way_blocks
    SELECT
        pep.polygon_id,
        ring_index,
		(pep.polygon_id || ring_index || is_multipolygon) as eid,
		ARRAY_AGG(final_node_id) as node_refs,
        '<way visible="true"  version="1" id="' || (pep.polygon_id || ring_index || is_multipolygon)  || '">' ||
        STRING_AGG('<nd ref="' || final_node_id || '"/>', E'' ORDER BY point_index) ||
        COALESCE(
            (
                SELECT STRING_AGG('<tag k="' || Key || '" v="' || CASE 
                        WHEN key = 'width' THEN TO_CHAR(value::float8, 'FM999999990.0')::text
                        WHEN key = 'step_count' THEN CAST(value AS INTEGER)::TEXT
                        ELSE content.tdei_escape_xml_attr(value)
                    END || '"/>', E'')
                FROM jsonb_each_text((
                    SELECT ep.feature_json
                    FROM temp_extension_polygons ep
                    WHERE ep.polygon_id = pep.polygon_id AND is_multipolygon IS FALSE LIMIT 1
                ) -> 'properties')
                WHERE key NOT IN ('_id', 'length')
                AND NOT (
                    key = 'foot' AND value = 'yes' AND (
                        (
                            (SELECT re.feature_json->'properties'->>'highway'
                             FROM temp_extension_polygons re
                             WHERE re.polygon_id = pep.polygon_id
                             LIMIT 1)
                        ) IN ('footway', 'pedestrian', 'steps', 'living_street')
                    )
                )
            ),
            ''
        ) ||
        '</way>' AS line
    FROM temp_parsed_extension_polygons pep
    GROUP BY pep.polygon_id, is_multipolygon, ring_index;
    -- Index on polygon_id for lookups
    -- Reason: Optimizes filtering and joins by polygon_id
    CREATE INDEX idx_temp_polygon_way_blocks_polygon_id ON temp_polygon_way_blocks(polygon_id);
    RAISE NOTICE 'processing temp_polygon_way_blocks() {%}', clock_timestamp() - operation_start_time;

    operation_start_time := clock_timestamp();
    -- Temporary table for polygon relation XML blocks
    -- Purpose: Formats multipolygons as OSM relation elements
    CREATE TEMPORARY TABLE temp_polygon_relation_blocks (
		eid varchar,
		way_refs varchar[],
        line TEXT
    ) ON COMMIT DROP;
    INSERT INTO temp_polygon_relation_blocks
    SELECT
       	pep.polygon_id as eid,
		  ARRAY_AGG(pep.polygon_id || ring_index || is_multipolygon) as way_refs,
		 '<relation visible="true"  version="1" id="' || pep.polygon_id || '">' || 
        STRING_AGG(
            DISTINCT 
            '<member type="way" ref="' || (pep.polygon_id || ring_index || is_multipolygon)  || 
            '" role="' || CASE WHEN ring_index = 1 THEN 'outer' ELSE 'inner' END || '"/>',
            ''
        ) ||
        '<tag k="type" v="multipolygon"/>' || 
        COALESCE(
            (
                SELECT string_agg('<tag k="' || key || '" v="' || content.tdei_escape_xml_attr(value) || '"/>', '')
                FROM jsonb_each_text(
                    (
                        SELECT ep.feature_json
                        FROM temp_extension_polygons ep
                        WHERE ep.polygon_id = pep.polygon_id
                        LIMIT 1
                    )::jsonb -> 'properties'
                )
                WHERE key NOT IN ('_id', '_w_id')
            ),
            ''
        ) ||
        '</relation>' AS line
    FROM temp_parsed_extension_polygons pep
    WHERE is_multipolygon
    GROUP BY pep.polygon_id;
    -- Index on polygon_id for lookups
    -- Reason: Optimizes filtering and joins by polygon_id
    CREATE INDEX idx_temp_polygon_relation_blocks_polygon_id ON temp_polygon_relation_blocks(eid);
    RAISE NOTICE 'processing temp_polygon_relation_blocks() {%}', clock_timestamp() - operation_start_time;

    operation_start_time := clock_timestamp();
    -- Temporary table for zone way XML blocks
    -- Purpose: Formats zones as OSM way elements
    CREATE TEMPORARY TABLE temp_zone_way_blocks (
        zone_id VARCHAR,
        ring_index BIGINT,
		eid VARCHAR,
		node_refs VARCHAR[],
        line TEXT
    ) ON COMMIT DROP;
    INSERT INTO temp_zone_way_blocks
    SELECT
        pzp.zone_id,
        ring_index,
		(pzp.zone_id || ring_index || is_multipolygon) as eid,
       	ARRAY_AGG(final_node_id) as node_refs,
		 '<way visible="true"  version="1" id="' || (pzp.zone_id || ring_index || is_multipolygon)  || '">' ||
        STRING_AGG('<nd ref="' || final_node_id || '"/>', E'' ORDER BY point_index) ||
        COALESCE(
            (
                SELECT STRING_AGG('<tag k="' || Key || '" v="' || CASE 
                        WHEN key = 'width' THEN TO_CHAR(value::float8, 'FM999999990.0')::text
                        WHEN key = 'step_count' THEN CAST(value AS INTEGER)::TEXT
                        ELSE content.tdei_escape_xml_attr(value)
                    END || '"/>', E'')
                FROM jsonb_each_text((
                    SELECT z.feature_json::jsonb
                    FROM temp_parsed_zones z
                    WHERE z.zone_id = pzp.zone_id AND is_multipolygon IS FALSE LIMIT 1
                ) -> 'properties')
                WHERE key NOT IN ('_id', '_w_id', 'length')
                AND NOT (
                    key = 'foot' AND value = 'yes' AND (
                        (
                            (SELECT re.feature_json->'properties'->>'highway'
                             FROM temp_parsed_zones re
                             WHERE re.zone_id = pzp.zone_id
                             LIMIT 1)
                        ) IN ('footway', 'pedestrian', 'steps', 'living_street')
                    )
                )
            ),
            ''
        ) ||
        CASE
            WHEN (
                SELECT 
                    (z.feature_json->'properties'->>'highway' = 'pedestrian')
                    AND (z.feature_json->'properties' ? '_w_id')
                FROM temp_parsed_zones z
                WHERE z.zone_id = pzp.zone_id AND is_multipolygon IS NOT TRUE
                LIMIT 1
            )
            THEN '<tag k="area" v="yes"/>'
            ELSE ''
        END ||
        '</way>' AS line
    FROM temp_parsed_zone_polygons pzp
    GROUP BY pzp.zone_id, is_multipolygon, ring_index;
    -- Index on zone_id for lookups
    -- Reason: Optimizes filtering and joins by zone_id
    CREATE INDEX idx_temp_zone_way_blocks_zone_id ON temp_zone_way_blocks(zone_id);
    RAISE NOTICE 'processing temp_zone_way_blocks() {%}', clock_timestamp() - operation_start_time;

    operation_start_time := clock_timestamp();
    -- Temporary table for zone relation XML blocks
    -- Purpose: Formats multipolygon zones as OSM relation elements
    CREATE TEMPORARY TABLE temp_zone_relation_blocks (
		eid VARCHAR,
		way_refs VARCHAR[],
        line TEXT
    ) ON COMMIT DROP;
    INSERT INTO temp_zone_relation_blocks
    SELECT
		pzp.zone_id as eid,
		ARRAY_AGG((pzp.zone_id || ring_index || is_multipolygon)) as way_refs,
        '<relation visible="true"  version="1" id="' || pzp.zone_id || '">' || 
        STRING_AGG(
            DISTINCT 
            '<member type="way" ref="' || (pzp.zone_id || ring_index || is_multipolygon)  || 
            '" role="' || CASE WHEN ring_index = 1 THEN 'outer' ELSE 'inner' END || '"/>',
            ''
        ) ||
        '<tag k="type" v="multipolygon"/>' || 
        COALESCE(
            (
                SELECT string_agg('<tag k="' || key || '" v="' || content.tdei_escape_xml_attr(value) || '"/>', '')
                FROM jsonb_each_text(
                    (
                        SELECT z.feature_json
                        FROM temp_parsed_zones z
                        WHERE z.zone_id = pzp.zone_id
                        LIMIT 1
                    )::jsonb -> 'properties'
                )
                WHERE key NOT IN ('_id', '_w_id')
            ),
            ''
        ) ||
        CASE
            WHEN (
                SELECT 
                    (z.feature_json->'properties'->>'highway' = 'pedestrian')
                    AND (z.feature_json->'properties' ? '_w_id')
                FROM temp_parsed_zones z
                WHERE z.zone_id = pzp.zone_id
                LIMIT 1
            ) 
            THEN '<tag k="area" v="yes"/>'
            ELSE ''
        END ||
        '</relation>' AS line
    FROM temp_parsed_zone_polygons pzp
    WHERE is_multipolygon
    GROUP BY pzp.zone_id;
    -- Index on zone_id for lookups
    -- Reason: Optimizes filtering and joins by zone_id
    CREATE INDEX idx_temp_zone_relation_blocks_zone_id ON temp_zone_relation_blocks(eid);
    RAISE NOTICE 'processing temp_zone_relation_blocks() {%}', clock_timestamp() - operation_start_time;

    operation_start_time := clock_timestamp();
    -- Temporary table for extension lines way XML blocks
    -- Purpose: Formats extension lines as OSM way elements
    CREATE TEMPORARY TABLE temp_extension_lines_way_blocks (
		eid VARCHAR,
		node_refs VARCHAR[],
        line TEXT
    ) ON COMMIT DROP;
    INSERT INTO temp_extension_lines_way_blocks
    SELECT
		pel.line_id as eid,
		ARRAY_AGG(final_node_id) as node_refs,
        '<way visible="true"  version="1" id="' || pel.line_id || '">' ||
        STRING_AGG('<nd ref="' || final_node_id || '"/>', E'' ORDER BY point_index) ||
        COALESCE(
            (
                SELECT STRING_AGG('<tag k="' || Key || '" v="' || CASE 
                        WHEN key = 'width' THEN TO_CHAR(value::float8, 'FM999999990.0')::text
                        WHEN key = 'step_count' THEN CAST(value AS INTEGER)::TEXT
                        ELSE content.tdei_escape_xml_attr(value)
                    END || '"/>', E'')
                FROM jsonb_each_text((
                    SELECT rel.feature_json
                    FROM temp_raw_extension_lines rel
                    WHERE rel.line_id = pel.line_id LIMIT 1
                ) -> 'properties')
                WHERE key NOT IN ('_id', 'length')
                AND NOT (
                    key = 'foot' AND value = 'yes' AND (
                        (
                            (SELECT re.feature_json->'properties'->>'highway'
                             FROM temp_raw_extension_lines re
                             WHERE re.line_id = pel.line_id
                             LIMIT 1)
                        ) IN ('footway', 'pedestrian', 'steps', 'living_street')
                    )
                )
            ),
            ''
        ) || 
        '</way>' AS line
    FROM temp_parsed_extension_lines pel
    GROUP BY pel.line_id;
    -- Index on line_id for lookups
    -- Reason: Optimizes filtering and joins by line_id
    CREATE INDEX idx_temp_extension_lines_way_blocks_line_id ON temp_extension_lines_way_blocks(eid);
    RAISE NOTICE 'processing temp_extension_lines_way_blocks() {%}', clock_timestamp() - operation_start_time;

    operation_start_time := clock_timestamp();
    -- Temporary table for final OSM XML output
    -- Purpose: Aggregates all XML elements (nodes, ways, relations)

	CREATE TEMPORARY TABLE temp_way_blocks (line TEXT, eid varchar, node_refs varchar[], seq_id bigint) ON COMMIT DROP;
	INSERT INTO temp_way_blocks (line, eid, node_refs)
	SELECT line, eid, node_refs FROM (
	    SELECT line, eid, node_refs FROM temp_edge_way_blocks
	    UNION ALL
	    SELECT line, eid, node_refs FROM temp_polygon_way_blocks
	    UNION ALL
	    SELECT line, eid, node_refs FROM temp_zone_way_blocks
	    UNION ALL
	    SELECT line, eid, node_refs FROM temp_extension_lines_way_blocks
	) AS combined_ways
	ORDER BY eid ASC;
    CREATE INDEX idx_temp_way_blocks_eid ON temp_way_blocks(eid);
	CREATE INDEX idx_temp_way_blocks_seq_id ON temp_way_blocks(seq_id);


	CREATE TEMPORARY TABLE temp_relation_blocks (line TEXT, eid varchar, way_refs varchar[], seq_id bigint) ON COMMIT DROP;
	INSERT INTO temp_relation_blocks (line, eid, way_refs)
	SELECT line, eid, way_refs FROM (
	    SELECT line, eid, way_refs FROM temp_zone_relation_blocks
	    UNION ALL
	    SELECT line, eid, way_refs FROM temp_polygon_relation_blocks
	) AS combined_relations
	ORDER BY eid ASC;
	CREATE INDEX idx_temp_relation_blocks_eid ON temp_relation_blocks(eid);
	CREATE INDEX idx_temp_relation_blocks_seq_id ON temp_relation_blocks(seq_id);

    RAISE NOTICE 'processing remapping - pre stage {%}', clock_timestamp();
    operation_start_time := clock_timestamp();

	-- 1. TEMP TABLE: node_map (old → new)
	CREATE TEMP TABLE node_map ON COMMIT DROP AS
	SELECT eid as old_id,
	       ROW_NUMBER() OVER (ORDER BY eid) AS new_id
	FROM temp_node_blocks;
	CREATE INDEX idx_node_map_old_id ON node_map(old_id);
	CREATE INDEX idx_node_map_new_id ON node_map(new_id);
	
	-- 2. TEMP TABLE: way_map (old → new)
	CREATE TEMP TABLE way_map ON COMMIT DROP  AS
	SELECT eid as old_id,
	       ROW_NUMBER() OVER (ORDER BY eid) AS new_id
	FROM temp_way_blocks;
	CREATE INDEX idx_way_map_old_id ON way_map(old_id);
	CREATE INDEX idx_way_map_new_id ON way_map(new_id);
	
	-- 3. TEMP TABLE: relation_map (old → new)
	CREATE TEMP TABLE relation_map ON COMMIT DROP  AS
	SELECT eid as old_id,
	       ROW_NUMBER() OVER (ORDER BY eid) AS new_id
	FROM temp_relation_blocks;
	CREATE INDEX idx_relation_map_old_id ON relation_map(old_id);
	CREATE INDEX idx_relation_map_new_id ON relation_map(new_id);
	
    RAISE NOTICE 'processing remapping - pre stage completed {%}', clock_timestamp() - operation_start_time;
    
	RAISE NOTICE 'processing remapping nodes {%}', clock_timestamp();
    operation_start_time := clock_timestamp();

	--remap nodes ids
	UPDATE temp_node_blocks n
	SET line = replace(
	    n.line,
	    'id="' || nm.old_id || '"',
	    'id="' || nm.new_id || '"'
	), seq_id = nm.new_id
	FROM node_map nm
	WHERE nm.old_id = n.eid;

	RAISE NOTICE 'processing remapping nodes completed {%}', clock_timestamp() - operation_start_time;

	RAISE NOTICE 'processing remapping ways {%}', clock_timestamp();
    operation_start_time := clock_timestamp();

	--remap way ids
	UPDATE temp_way_blocks n
	SET line = replace(
	    n.line,
	    'id="' || nm.old_id || '"',
	    'id="' || nm.new_id || '"'
	), seq_id = nm.new_id
	FROM way_map nm
	WHERE nm.old_id = n.eid;

	--remap ways noderefs	
	DO $$
	DECLARE
	    w_row RECORD;
	    old_ref varchar;
	    new_ref bigint;
	    updated_line text;
	BEGIN
    FOR w_row IN
        SELECT eid, line, node_refs
        FROM temp_way_blocks
    LOOP
        -- start with original line
        updated_line := w_row.line;

        -- if node_refs is null or empty, skip the inner loop
        IF w_row.node_refs IS NOT NULL AND array_length(w_row.node_refs,1) > 0 THEN

            -- For each old node id referenced by this way
            FOREACH old_ref IN ARRAY w_row.node_refs
            LOOP
                -- find mapping (if any)
                SELECT new_id INTO new_ref FROM node_map WHERE old_id = old_ref LIMIT 1;

                IF new_ref IS NOT NULL THEN
                    -- global replace all occurrences of ref="OLD" -> ref="NEW"
                    updated_line := replace(
                        updated_line,
                        'ref="' || old_ref || '"',
                        'ref="' || new_ref || '"'
                    );
                END IF;
            END LOOP;
        END IF;

        -- Optionally remap the way's own id using way_map (uncomment if desired)
        -- PERFORM 1; -- placeholder
        -- IF EXISTS (SELECT 1 FROM way_map WHERE old_id = w_row.eid) THEN
        --     SELECT new_id INTO new_ref FROM way_map WHERE old_id = w_row.eid LIMIT 1;
        --     IF new_ref IS NOT NULL THEN
        --         updated_line := regexp_replace(
        --             updated_line,
        --             '<way([^>]*?)id="' || w_row.eid || '"',
        --             '<way\1id="' || new_ref || '"',
        --             ''); -- not 'g' to replace only the opening tag, or adjust regex as needed
        --     END IF;
        -- END IF;

        -- Write back the updated line only if changed
        IF updated_line IS DISTINCT FROM w_row.line THEN
            UPDATE temp_way_blocks
            SET line = updated_line
            WHERE eid = w_row.eid;
        END IF;
    END LOOP;
	END$$;

	-- WHERE w.line LIKE '%ref="' || nm.old_id || '"%';
	RAISE NOTICE 'processing remapping ways completed {%}', clock_timestamp() - operation_start_time;

	RAISE NOTICE 'processing remapping relations {%}', clock_timestamp();
    operation_start_time := clock_timestamp();

	--remap relation ids
	UPDATE temp_relation_blocks n
	SET line = replace(
	    n.line,
	    'id="' || nm.old_id || '"',
	    'id="' || nm.new_id || '"'
	), seq_id = nm.new_id
	FROM relation_map nm
	WHERE nm.old_id = n.eid;

	--remap relations way refs
	DO $$
	DECLARE
	    r_row RECORD;
	    old_ref varchar;
	    new_ref bigint;
	    updated_line text;
	BEGIN
    FOR r_row IN
        SELECT eid, line, way_refs
        FROM temp_relation_blocks
    LOOP
        -- Start with original line
        updated_line := r_row.line;

        -- Only proceed if relation has way refs
        IF r_row.way_refs IS NOT NULL AND array_length(r_row.way_refs,1) > 0 THEN

            -- Loop through each old way id used in relation
            FOREACH old_ref IN ARRAY r_row.way_refs
            LOOP
                -- Lookup new id
                SELECT new_id INTO new_ref
                FROM way_map
                WHERE old_id = old_ref
                LIMIT 1;

                IF new_ref IS NOT NULL THEN
                    -- Replace all occurrences of ref="old_ref"
                    updated_line := replace(
                        updated_line,
                        'ref="' || old_ref || '"',
                        'ref="' || new_ref || '"'
                    );
                END IF;
            END LOOP;
        END IF;

        -- Write back the updated relation line
        IF updated_line IS DISTINCT FROM r_row.line THEN
            UPDATE temp_relation_blocks
            SET line = updated_line
            WHERE eid = r_row.eid;
        END IF;

    END LOOP;
	END$$;
	
	RAISE NOTICE 'processing remapping relations completed {%}', clock_timestamp() - operation_start_time;



	CREATE TEMP TABLE temp_exportdata(line TEXT, seq_id BIGINT, type INT) ON COMMIT DROP;
	CREATE INDEX idx_temp_exportdata_seq_id ON temp_exportdata(seq_id);
	CREATE INDEX idx_temp_exportdata_type ON temp_exportdata(type);

	-- header
	INSERT INTO temp_exportdata VALUES ('<?xml version="1.0" encoding="UTF-8"?><osm version="0.6" generator="TDEI exporter" upload="false">', 1, 0);
	
	-- nodes
	INSERT INTO temp_exportdata
	SELECT line,seq_id, 1 as type FROM temp_node_blocks ORDER BY seq_id asc;
	
	-- ways
	INSERT INTO temp_exportdata
	SELECT line,seq_id, 2 as type FROM temp_way_blocks ORDER BY seq_id asc;
	
	-- relations
	INSERT INTO temp_exportdata
	SELECT line,seq_id, 3 as type FROM temp_relation_blocks ORDER BY seq_id asc;
	
	-- footer
	INSERT INTO temp_exportdata VALUES ('</osm>', 5);
	-- Open one cursor on the ordered data
   -- Return each line in order (you can adjust ORDER BY to your needs)
    FOR line_ex IN
        SELECT line FROM temp_exportdata ORDER BY type,seq_id asc
    LOOP
        RETURN NEXT line_ex;
    END LOOP;
    RAISE NOTICE 'processing temp_exportdata() {%}', clock_timestamp() - operation_start_time;

    RETURN;
END;
$BODY$;
