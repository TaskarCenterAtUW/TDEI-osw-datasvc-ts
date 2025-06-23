-- FUNCTION: content.tdei_union_dataset(character varying, character varying, real)

-- DROP FUNCTION IF EXISTS content.tdei_union_dataset(character varying, character varying, real);

CREATE OR REPLACE FUNCTION content.tdei_union_dataset(
	src_one_tdei_dataset_id character varying,
	src_two_tdei_dataset_id character varying,
	proximity real DEFAULT 0.5)
    RETURNS TABLE(file_name text, cursor_ref refcursor) 
    LANGUAGE 'plpgsql'
    COST 100
    VOLATILE PARALLEL UNSAFE
    ROWS 1000

AS $BODY$
DECLARE
    zone_exists BOOLEAN;
    result_cursor REFCURSOR;
    fname TEXT;
    row_count BIGINT;
    node_mixed_type_keys JSONB;
    edge_mixed_type_keys JSONB;
	proximity_degrees real;
BEGIN
    -- Convert proximity from meters to degrees for EPSG:4326 (1 degree ≈ 111,111 meters)
    proximity_degrees := proximity / 111111;
	
    ------------------------------ Prepare Input Points -------------------------------------
    -- =================================================
	-- Assumed inputs: AllPoints and Paths
	-- =================================================
	
	-- Construct Allpoints to include nodes AND internal nodes of edges
	-- This view/temp/table should be constructed to include ALL points 
	-- (including internal points from ALL datasets that we are unioning)
	-- (typically just two)
	
	-- source is the name of the dataset 
	-- 		(not necessarily used, unless we want to favor one source over another)
	-- element_id is the id of the node or edge
	-- element_sub_id is the id of an internal node that indicates order; used to reconstruct edges
	-- 		element_sub_id is just 0 for all nodes and edges.
	-- geom is the geometry of the node / internal node or edge
    CREATE TEMP TABLE all_points ON COMMIT DROP AS
	-- Find the nodes in the test datasets
    WITH nodes AS (
        SELECT 
            tdei_dataset_id AS source, 
            id AS element_id, 
			-- assign 0 as the sub_id
			-- for nodes and edges, there is no sub_id (it's always 0)
			-- for internal line string nodes, there is a sub_id (see below)
            0 AS element_sub_id, 
            node_loc AS geom
        FROM content.node
        WHERE tdei_dataset_id IN (src_one_tdei_dataset_id, src_two_tdei_dataset_id)
    ),
    edge_points AS (
        SELECT 
            e.tdei_dataset_id AS source, 
            e.id AS element_id, 
			-- sub id indicates the order or the internal nodes.  
			-- Begins with 1 (not 0, which is important)
            dp.path[1] AS element_sub_id, 
            dp.geom
        FROM content.edge e, ST_DumpPoints(e.edge_loc) dp
        WHERE e.tdei_dataset_id IN (src_one_tdei_dataset_id, src_two_tdei_dataset_id)
    )
	-- From nodes
    SELECT * FROM nodes
    UNION
	-- From internal linestring nodes
    SELECT * FROM edge_points;

    CREATE INDEX ON all_points USING GIST (geom);

	-- =========================================
	--- Start of algorithm --
	-- =========================================
	
	
	
	-- Inputs: 
	-- AllPoints(source, element_id, element_sub_id, geom::Point)
	-- Path(source, element_id, geom::LineString)
	-- Tolerance: A distance (in degrees in this implementation) 
	--  		representing the maximum distance two nodes can be apart to 
	-- 			still be considered the same cluster.  Friends-of-friends clustering.
	
	-- source is the name of the dataset 
	-- 		(not necessarily used, unless we want to favor one source over another)
	-- element_id is the id of the node or edge
	-- element_sub_id is the id of an internal node that indicates order; used to reconstruct edges
	-- 		element_sub_id is just 0 for non-internal nodes.
	-- geom is the geometry of the node / internal node or edge
	
	-- Outputs:
	-- UnionNodes(source, id, geom)
	-- UnionEdges(source, id, geom)
	
	-- Notes / TODOs:
	-- ** id in UnionNodes will NOT be the original id from the nodes table,
	-- though geom will be one of the original nodes. So, you can join on geom 
	-- to recover the original id. We will need to do so to set _u and _v properly
	-- in edges. (One way to resolve is to use the cantor pairing function to combine 
	-- (element_id, element_sub_id) into one number, then extract the pair. I was doing 
	-- this originally, but it added some extra code that was not critical.)
	
	-- ** UnionNodes includes only the main nodes; we filter out internal nodes as
	-- those are only used to reconstruct edges.
	
	-- ** We select a witness from among the cluster -- the minimum id from the lowest source alphabetically.
	-- Other options: favor one source in particular, compute the centroid of the cluster, pick a near-centroid choice, etc.

    CREATE TEMP TABLE point_to_witness ON COMMIT DROP AS
    WITH RECURSIVE
	-- Step 1: Prepare ids, if needed
    seeded AS (
        SELECT 
            source, 
            element_id, 
            element_sub_id, 
            geom,
            ROW_NUMBER() OVER (ORDER BY element_id, element_sub_id) AS id
        FROM all_points
    ),
	-- Step 2: Find all pairs within tolerance (set tolerance here)
	-- Use ST_DWithin so it can use an index
	-- Avoid symmetric pairs using a.id < b.id
    pairwise AS (
        SELECT a.id AS id1, b.id AS id2
        FROM seeded a
        JOIN seeded b ON a.id < b.id
        WHERE ST_DWithin(a.geom, b.geom, proximity_degrees) -- nodes within this distance should be clustered
    ),
	-- Step 3: Recursive friend-of-friend closure: keep joining until 
	-- the result does not change
    clusters AS (
        SELECT id1, id2 FROM pairwise
        UNION
        SELECT c.id1, p.id2
        FROM clusters c
        JOIN pairwise p ON c.id2 = p.id1 AND c.id1 < p.id2
    ),
	-- Step 4: Assign each point a single cluster representative -- remove hierarchical subclusters.
	-- That is, each point is a part of multiple clusters; we only want the biggest.
	-- For example, Clusters contains {(2,1), (3,1), (4,1), (3,2), (4,2), (4,3).}
	-- We only want the biggest cluster with id 1: (2,1), (3,1), (4,1)
	-- Also include singleton clusters that were not nearby any other points.
    canonical AS (
        SELECT id2 AS id, MIN(id1) AS cluster_id
        FROM clusters
        GROUP BY id2
        UNION ALL
		-- include singleton clusters (points that are not within tolerance of any other point)
        SELECT id, id FROM seeded
        WHERE id NOT IN (SELECT id2 FROM clusters)
    ),
	-- Step 5: Determine one witness point per cluster 
	-- (chooses minimum source currently. Could do centroid, or any other conditions)
    witness AS (
        SELECT DISTINCT ON (c.cluster_id) 
            c.cluster_id, 
            s.geom AS cluster_geom,
            s.source,
            s.element_id AS witness_element_id
        FROM canonical c
        JOIN seeded s ON c.id = s.id
        ORDER BY c.cluster_id, s.source, s.element_id
    ),
	-- Step 6: Map every point to its witness point
	-- source, id, element_id, and element_sub_id are the original point
	-- cluster_id, cluster_geom are the new cluster witness which replaces the original 
	-- SELECT DISTINCT cluster_id, cluster_geom FROM PointToWitness
	-- returns all points (including internal) in the entire unioned dataset.
    point_to_witness AS (
        SELECT 
            s.source,
            s.element_id,
            s.element_sub_id,
            s.geom,
            w.cluster_id,
            w.cluster_geom,
            w.witness_element_id
        FROM seeded s
        JOIN canonical c ON s.id = c.id
        JOIN witness w ON c.cluster_id = w.cluster_id
    )
    SELECT * FROM point_to_witness;

    CREATE INDEX ON point_to_witness (element_id, element_sub_id);
    CREATE INDEX ON point_to_witness USING GIST (cluster_geom);

    ------------------------------ Reconstruct Nodes -------------------------------------
    CREATE TEMP TABLE new_export_nodes ON COMMIT DROP AS
    SELECT DISTINCT ON (n.id)
        n.id,
        p.cluster_geom AS loc,
        jsonb_build_object(
            'type', 'Feature',
            'geometry', ST_AsGeoJSON(p.cluster_geom, 15)::json,
            'properties', 
            jsonb_build_object('_id', n.id::text) || 
            ((n.feature::jsonb->'properties') - '_id')
        ) AS feature
    FROM point_to_witness p
    JOIN content.node n 
        ON p.witness_element_id = n.id 
        AND p.element_sub_id = 0
        AND n.tdei_dataset_id = p.source
    WHERE p.element_sub_id = 0;

    CREATE INDEX ON new_export_nodes (id);
    CREATE INDEX ON new_export_nodes USING GIST (loc);

    ------------------------------ Reconstruct Edges -------------------------------------
    CREATE TEMP TABLE reconstructed_edges ON COMMIT DROP AS
    WITH edge_points AS (
        SELECT 
            p.element_id,
            p.source,
            ARRAY_AGG(p.cluster_geom ORDER BY p.element_sub_id) AS points
        FROM point_to_witness p
        WHERE p.element_sub_id > 0
        GROUP BY p.element_id, p.source
    )
    SELECT 
        e.id,
        ST_MakeLine(ep.points) AS loc,
        e.feature
    FROM edge_points ep
    JOIN content.edge e 
        ON e.id = ep.element_id 
        AND e.tdei_dataset_id = ep.source
    WHERE NOT ST_Equals(ST_StartPoint(ST_MakeLine(ep.points)), ST_EndPoint(ST_MakeLine(ep.points)))
      AND NOT ST_Envelope(ST_MakeLine(ep.points)) = ST_PointN(ST_MakeLine(ep.points), 1);

    CREATE INDEX ON reconstructed_edges (id);
    CREATE INDEX ON reconstructed_edges USING GIST (loc);

    -- Rebuild edge node IDs
    CREATE TEMP TABLE feature_edges ON COMMIT DROP AS
    SELECT DISTINCT ON (e.id)
        e.id AS edge_id,
        jsonb_build_object(
            'type', 'Feature',
            'geometry', ST_AsGeoJSON(e.loc, 15)::json,
            'properties',
            jsonb_build_object(
                '_id', ROW_NUMBER() OVER (ORDER BY e.id)::text,
                '_u_id', (
                    SELECT n.id::text
                    FROM new_export_nodes n
                    WHERE n.loc && ST_StartPoint(e.loc)
                    AND ST_SnapToGrid(n.loc, 0.00000001) = ST_SnapToGrid(ST_StartPoint(e.loc), 0.00000001)
                    LIMIT 1
                ),
                '_v_id', (
                    SELECT n.id::text
                    FROM new_export_nodes n
                    WHERE n.loc && ST_EndPoint(e.loc)
                    AND ST_SnapToGrid(n.loc, 0.00000001) = ST_SnapToGrid(ST_EndPoint(e.loc), 0.00000001)
                    LIMIT 1
                )
            ) || (COALESCE(e.feature::jsonb->'properties', '{}'::jsonb) - '_id' - '_u_id' - '_v_id')
        ) AS feature,
        ROW_NUMBER() OVER (ORDER BY e.id) AS seq_id
    FROM reconstructed_edges e;

    ------------------------------ Export Nodes -------------------------------------
    SELECT COUNT(*) INTO row_count FROM new_export_nodes;
    RAISE NOTICE 'The table nodes has % rows.', row_count;

    SELECT jsonb_object_agg(key, TRUE)
    INTO node_mixed_type_keys
    FROM (
        SELECT DISTINCT key
        FROM new_export_nodes e, jsonb_each(COALESCE(e.feature::jsonb->'properties', '{}'::jsonb)) prop
        WHERE key LIKE 'ext:%'
        GROUP BY key
        HAVING COUNT(DISTINCT jsonb_typeof(value)) > 1
    ) sub;

    UPDATE new_export_nodes
    SET feature = jsonb_set(
        feature,
        '{properties}',
        (SELECT jsonb_object_agg(
            key,
            CASE WHEN node_mixed_type_keys ? key AND jsonb_typeof(value) != 'string'
                 THEN to_jsonb(value::text)
                 ELSE value
            END)
         FROM jsonb_each(feature::jsonb->'properties'))
    )
    WHERE EXISTS (
        SELECT 1 FROM jsonb_each(feature::jsonb->'properties') WHERE key LIKE 'ext:%'
    );

    fname := 'node';
    result_cursor := 'node_cursor';
    OPEN result_cursor FOR
        SELECT feature
        FROM new_export_nodes
        WHERE feature IS NOT NULL
        ORDER BY id;
    file_name := fname;
    cursor_ref := result_cursor;
    RETURN NEXT;

    ------------------------------ Export Edges -------------------------------------
    SELECT COUNT(*) INTO row_count FROM feature_edges;
    RAISE NOTICE 'The table edges has % rows.', row_count;

    SELECT jsonb_object_agg(key, TRUE)
    INTO edge_mixed_type_keys
    FROM (
        SELECT DISTINCT key
        FROM feature_edges e, jsonb_each(COALESCE(e.feature::jsonb->'properties', '{}'::jsonb)) prop
        WHERE key LIKE 'ext:%'
        GROUP BY key
        HAVING COUNT(DISTINCT jsonb_typeof(value)) > 1
    ) sub;

    UPDATE feature_edges
    SET feature = jsonb_set(
        feature,
        '{properties}',
        (SELECT jsonb_object_agg(
            key,
            CASE WHEN edge_mixed_type_keys ? key AND jsonb_typeof(value) != 'string'
                 THEN to_jsonb(value::text)
                 ELSE value
            END)
         FROM jsonb_each(feature::jsonb->'properties'))
    )
    WHERE EXISTS (
        SELECT 1 FROM jsonb_each(feature::jsonb->'properties') WHERE key LIKE 'ext:%'
    );

    fname := 'edge';
    result_cursor := 'edge_cursor';
    OPEN result_cursor FOR
        SELECT feature
        FROM feature_edges
        WHERE feature IS NOT NULL
        ORDER BY seq_id;
    file_name := fname;
    cursor_ref := result_cursor;
    RETURN NEXT;

    RETURN;
END;
$BODY$;

ALTER FUNCTION content.tdei_union_dataset(character varying, character varying, real)
    OWNER TO tdeiadmin;
