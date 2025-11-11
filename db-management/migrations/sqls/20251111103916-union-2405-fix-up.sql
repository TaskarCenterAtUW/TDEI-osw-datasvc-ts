CREATE OR REPLACE FUNCTION content.tdei_union_dataset2(
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
    result_cursor REFCURSOR;
    fname TEXT;
    row_count BIGINT;
    node_mixed_type_keys JSONB;
    edge_mixed_type_keys JSONB;
	zone_mixed_type_keys JSONB;

    point_mixed_type_keys JSONB;
    line_mixed_type_keys JSONB;
	polygon_mixed_type_keys JSONB;
	proximity_degrees real;
	    rec RECORD;

BEGIN
    -- Convert proximity from meters to degrees for EPSG:4326 (1 degree ≈ 111,111 meters)
    proximity_degrees := proximity / 111111;

	------------------------------ Prepare Input Points -------------------------------------
    ------------------------------------------------
    ---Start: Handle core files ---
    ------------------------------------------------
	-- Find the nodes in the test datsets
	CREATE TEMP TABLE testnodes ON COMMIT DROP AS (
		select 
			n.tdei_dataset_id as source, 
             'core' as type,
			n.id as element_id, 
			n.feature,
			n.node_id,
			-- assign 0 as the sub_id
			-- for nodes and edges, there is no sub_id (it's always 0)
			-- for internal line string nodes, there is a sub_id (see below)
			0 as element_sub_id, 
			0 as element_sub_sub_id,
			n.node_loc as geom
			-- n.node_loc_3857 as geom_3857 
		from content.node n
		where n.tdei_dataset_id IN (src_one_tdei_dataset_id, src_two_tdei_dataset_id)
	);
	CREATE INDEX idx_testnodes_element_id ON testnodes (element_id);

	-- Find the edges in the test datsets
	CREATE TEMP TABLE testedges ON COMMIT DROP AS (
		select 	
			e.tdei_dataset_id as source, 
			e.id as element_id, 
			e.edge_loc as geom,
			-- e.edge_loc_3857 as geom_3857,
			e.feature
		from content.edge e
		where e.tdei_dataset_id IN (src_one_tdei_dataset_id, src_two_tdei_dataset_id)
	);
	CREATE INDEX idx_testedges_element_id ON testedges (element_id,source);

	-- Find the edges in the test zones
	CREATE TEMP TABLE testzones ON COMMIT DROP AS (
		select 	
			z.tdei_dataset_id as source, 
			z.id as element_id, 
			z.zone_loc as geom,
			-- z.zone_loc_3857 as geom_3857,
			z.feature,
			z.node_ids
		from content.zone z
		where z.tdei_dataset_id IN (src_one_tdei_dataset_id, src_two_tdei_dataset_id)
	);
	CREATE INDEX idx_testzones_element_id ON testzones (element_id,source);
    CREATE INDEX ON testzones USING GIST (geom);

	-- Find the *internal* nodes for the edges in the test datasets
	CREATE TEMP TABLE testedgepoints ON COMMIT DROP AS (
	  SELECT 
			path.source, 
             'core' as type,
			path.element_id,
			-- sub id indicates the order or the internal nodes.  
			-- Begins with 1 (not 0, which is important)
			dp.path[1] AS element_sub_id,
			0 as element_sub_sub_id, -- for polygon rings
			dp.geom
			-- ST_Transform(dp.geom, 3857) AS geom_3857
	  FROM testedges path, ST_DumpPoints(path.geom) dp
	);

	-- Find the *internal* nodes for the zones in the test datasets
	CREATE TEMP TABLE testzonepoints ON COMMIT DROP AS (
	  SELECT 
	  		z.source, 
             'core' as type,
	  		z.element_id,
			-- sub id indicates the order or the internal nodes.  
			-- Begins with 1 (not 0, which is important)
	   		p.path[1] AS element_sub_id,         -- 1 = outer, 2+ = holes
			p.path[2] as element_sub_sub_id, -- for polygon rings
	        p.geom
			-- ST_Transform(p.geom, 3857) AS geom_3857
	  FROM testzones z, LATERAL ST_DumpPoints(geom) p
	);
------------------------------------------------
---END: Handle core files ---
------------------------------------------------

------------------------------------------------
---Start: Handle extension files ---
------------------------------------------------

-- Find the nodes in the test datsets
	CREATE TEMP TABLE ext_points ON COMMIT DROP AS (
		select 
			n.tdei_dataset_id as source, 
             'extension_point' as type,
			n.id as element_id, 
			n.feature,
			n.point_id,
			-- assign 0 as the sub_id
			-- for nodes and edges, there is no sub_id (it's always 0)
			-- for internal line string nodes, there is a sub_id (see below)
			0 as element_sub_id, 
			0 as element_sub_sub_id,
			n.point_loc as geom
			-- n.point_loc_3857 as geom_3857
		from content.extension_point n
		where n.tdei_dataset_id IN (src_one_tdei_dataset_id, src_two_tdei_dataset_id)
	);
	CREATE INDEX idx_ext_points_element_id ON ext_points (element_id);

	-- Find the edges in the test datsets
	CREATE TEMP TABLE ext_lines ON COMMIT DROP AS (
		select 	
			e.tdei_dataset_id as source, 
			e.id as element_id, 
			e.line_loc as geom,
			-- e.line_loc_3857 as geom_3857,
			e.feature
		from content.extension_line e
		where e.tdei_dataset_id IN (src_one_tdei_dataset_id, src_two_tdei_dataset_id)
	);
	CREATE INDEX idx_ext_lines_element_id ON ext_lines (element_id,source);

	-- Find the edges in the test zones
	CREATE TEMP TABLE ext_polygons ON COMMIT DROP AS (
		select 	
			z.tdei_dataset_id as source, 
			z.id as element_id, 
			z.polygon_loc as geom,
			-- z.polygon_loc_3857 as geom_3857,
			z.feature
		from content.extension_polygon z
		where z.tdei_dataset_id IN (src_one_tdei_dataset_id, src_two_tdei_dataset_id)
	);
	CREATE INDEX idx_ext_polygons_element_id ON ext_polygons (element_id,source);
    CREATE INDEX ON ext_polygons USING GIST (geom);

	-- Find the *internal* nodes for the edges in the test datasets
	CREATE TEMP TABLE ext_linepoints ON COMMIT DROP AS (
	  SELECT 
			path.source, 
             'extension_line' as type,
			path.element_id,
			-- sub id indicates the order or the internal nodes.  
			-- Begins with 1 (not 0, which is important)
			dp.path[1] AS element_sub_id,
			0 as element_sub_sub_id, -- for polygon rings
			dp.geom
			-- ST_Transform(dp.geom, 3857) AS geom_3857
	  FROM ext_lines path, ST_DumpPoints(path.geom) dp
	);

	-- Find the *internal* nodes for the zones in the test datasets
	CREATE TEMP TABLE ext_polygonpoints ON COMMIT DROP AS (
	  SELECT 
	  		z.source, 
             'extension_polygon' as type,
	  		z.element_id,
			-- sub id indicates the order or the internal nodes.  
			-- Begins with 1 (not 0, which is important)
	   		p.path[1] AS element_sub_id,         -- 1 = outer, 2+ = holes
			p.path[2] as element_sub_sub_id, -- for polygon rings
	        p.geom
			-- ST_Transform(p.geom, 3857) AS geom_3857
	  FROM ext_polygons z, LATERAL ST_DumpPoints(geom) p
	);

    --- Handle extension files ---

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
    CREATE TEMP TABLE AllPoints ON COMMIT DROP AS
	-- From nodes
	SELECT 
		source, 
        type,
		element_id, 
		element_sub_id, 
	    element_sub_sub_id, 
		geom
		-- geom_3857
	FROM testnodes
	UNION
	-- From internal linestring nodes
	SELECT 
		source, 
        type,
		element_id, 
		element_sub_id, 
	    element_sub_sub_id, 
		geom
		-- geom_3857
	FROM testedgepoints
	UNION
-- From internal polygon nodes (may be redundant, hence union)
	SELECT 
		source, 
        type,
		element_id, 
		element_sub_id, 
	    element_sub_sub_id, 
		geom
		-- geom_3857 
	FROM testzonepoints
    UNION
    -- From extension points
    SELECT 
        source, 
        type,
        element_id, 
        element_sub_id, 
        element_sub_sub_id, 
        geom
		-- geom_3857 
    FROM ext_points
    UNION
    -- From extension lines
    SELECT 
        source, 
        type,
        element_id, 
        element_sub_id, 
        element_sub_sub_id, 
        geom
		-- geom_3857 
    FROM ext_linepoints
    UNION
    -- From extension polygons
    SELECT 
        source, 
        type,
        element_id, 
        element_sub_id, 
        element_sub_sub_id, 
        geom
		-- geom_3857 
    FROM ext_polygonpoints;

    CREATE INDEX ON AllPoints USING GIST (geom);

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
	
	-- Invariants: 
	-- UnionNodes contains no pair of points x,y such that dist(x.geom,y.geom) < tolerance 
	--       x,y \in UnionNodes => dist(x.geom,y.geom) >= tolerance
	-- UnionNodes contains no node geometry that did not appear in AllPoints (id will differ) 
	--       x \in UnionNodes => x.geom \in {y.geom | y \in AllPoints}
	-- For any pair of edges e,f in UnionEdges, the exists no pair of internal nodes e.x, f.y such that dist(e.x,e.y) < tolerance
	--       e,f \in UnionEdges => ( x \in e, y \in f => dist(x.geom,y.geom) < tolerance )
	-- For any edge e in UnionEdges, there exists no internal node e.x that does not appear in AllPoints
	--       e \in UnionEdges => ( x \in e => x \in AllPoints)
	-- Let x,y be tolerance-reachable if there exists a path P=(x,p1,p2,...,pn,y) such that 
	--         pi, pj \in P, j=i+1 => dist(pi.geom,pj.geom) < tolerance
	-- 		Then
	-- 			Every node x in AllPoints is associated with a node witness(x) such that x is tolerance-reachable to witness(x).
	-- 			x \in AllPoints <=> witness(x) \in UnionNode
	-- 			If x is tolerance-reachable to y in AllPoints through (x, p1, p2, ..., pn, y), there is an 
	-- 		    	edge (witness(x), c1, c2, ..., cm, witness(y)) where cj = witness(k) for some node k in AllPoints.
	-- 				That is, every path consists of witnesses, but there may be fewer internal nodes in the output than the input
	--
	-- 
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
	
	
    RAISE NOTICE 'Start algorithm at: %', clock_timestamp();
	-- ====================================================================================
	-- Step 1: Materialize all points with ids, so we can index the geometry column
	-- ====================================================================================

	CREATE TEMP TABLE MaterializedPoints ON COMMIT DROP AS
	SELECT source, type, element_id, element_sub_id, element_sub_sub_id, geom,
	-- construct new ids for each node (could use cantor pairing function here)
	row_number() OVER (ORDER BY element_id, element_sub_id, element_sub_sub_id) as id
	FROM AllPoints;
	
	-- CREATE spatial INDEX on materialized nodes -- must use for performance!
	CREATE INDEX idx_mat_geom ON MaterializedPoints USING GIST (geom);
	-- CREATE INDEX idx_mat_geom_3857 ON MaterializedPoints USING GIST (geom_3857);
	CREATE INDEX idx_mat_id ON MaterializedPoints (id);
	
	-- ====================================================================================
	-- Step 2: Join to get pairs of nearby nodes.  Materialize.  Set tolerance here.
	-- ====================================================================================
	
	CREATE TEMP TABLE Neighbors ON COMMIT DROP AS
	  SELECT a.id AS id1, b.id AS id2, a.type
	  FROM MaterializedPoints a
	  JOIN MaterializedPoints b 
      ON a.type = b.type
	   AND a.source != b.source  
	  --   AND a.source = 'd1'            -- D1 = fixed dataset
   -- AND b.source = 'd2'            -- D2 = to be clustered
      AND ST_DWithin(a.geom, b.geom, proximity_degrees)  -- Tolerance: nodes within this distance should be clustered
	  AND a.id < b.id;
	
	CREATE INDEX idx_id1_id2 ON Neighbors (id1, id2);

	-- ====================================
	-- Step 3: Recursive friend-of-friend closure: keep joining until 
	-- the result does not change. Materialize.
	-- ====================================
	
	CREATE TEMP TABLE Clusters ON COMMIT DROP AS
	WITH RECURSIVE
	Clusters(id1, id2, type) AS (
	  SELECT id1, id2, type FROM Neighbors
	  UNION
	  SELECT c.id1, p.id2, c.type
	  FROM Clusters c
	  JOIN Neighbors p ON c.id2 = p.id1 AND c.id1 < p.id2 AND c.type = p.type
	)
	SELECT * FROM Clusters;
	CREATE INDEX idx_clusters_id2 ON Clusters (id1, id2);

	-- ====================================
	-- Step 4: Assign cluster representatives
	-- ====================================

		-- Assign each point a single cluster representative -- remove hierarchical subclusters.
		-- That is, each point is a part of multiple clusters; we only want the biggest.
		-- For example, Clusters contains {(2,1), (3,1), (4,1), (3,2), (4,2), (4,3).}
		-- We only want the biggest cluster with id 1: (2,1), (3,1), (4,1)
		-- Also include singleton clusters that were not nearby any other points.
		CREATE TEMP TABLE Canonical ON COMMIT DROP AS
		SELECT id2 AS id, MIN(id1) AS cluster_id, type
		FROM Clusters
		GROUP BY id2, type
		UNION ALL
		SELECT id, id, type FROM (
			SELECT id, type FROM MaterializedPoints
			EXCEPT 
			SELECT id2, type FROM Clusters
		) x;
		
		CREATE INDEX ON Canonical (id);

		-- Step 5: Determine one witness point per cluster 
		-- (chooses minimum source currently. Could do centroid, or any other conditions)
		CREATE TEMP TABLE Witness ON COMMIT DROP AS
		SELECT DISTINCT ON (c.cluster_id) 
		    c.cluster_id, 
		    s.geom AS cluster_geom,
		    s.source,
		    s.type,
		    s.element_id AS witness_element_id
		FROM Canonical c
		JOIN MaterializedPoints s ON c.id = s.id
		ORDER BY c.cluster_id, s.source;
		
		CREATE INDEX ON Witness (cluster_id);

		-- Step 6: Map every point to its witness point
		-- source, id, element_id, and element_sub_id are the original point
		-- cluster_id, cluster_geom are the new cluster witness which replaces the original 
		-- SELECT DISTINCT cluster_id, cluster_geom FROM PointToWitness
		-- returns all points (including internal) in the entire unioned dataset.
		CREATE TEMP TABLE PointToWitness ON COMMIT DROP AS
		SELECT 
		    s.source,
		    s.type,
		    s.element_id,
		    s.element_sub_id,
			s.element_sub_sub_id,
		    s.geom,
		    w.cluster_id,
		    w.cluster_geom
		    -- w.witness_element_id
		FROM MaterializedPoints s
		JOIN Canonical c ON s.id = c.id
		JOIN Witness w ON c.cluster_id = w.cluster_id AND c.type = w.type;
		
		CREATE INDEX ON PointToWitness (element_id, element_sub_id);
		CREATE INDEX ON PointToWitness USING GIST (cluster_geom);

	RAISE NOTICE 'Ending algorithm at: %', clock_timestamp();

    ------------------------------------------------
    ---Start: Reconstruct core files ---
    ------------------------------------------------
    ------------------------------ Reconstruct Zones -------------------------------------
    RAISE NOTICE 'Stating Zone processing at: %', clock_timestamp();

	CREATE TEMP TABLE UnionZones ON COMMIT DROP AS
	WITH 
	-- Step 1: Reaggregate witness points to build new rings as a LINESTRING
	ring_lines AS (
	  SELECT 
	    p.source, 
	    p.element_id, 
	    p.element_sub_id,
	    ST_MakeLine(p.geom ORDER BY p.element_sub_sub_id) AS old_ring_geom,
	    ST_MakeLine(w.cluster_geom ORDER BY w.element_sub_sub_id) AS new_ring_geom,
	    ARRAY_AGG(n.element_id ORDER BY p.element_sub_sub_id, w.element_sub_sub_id)
      FILTER (WHERE n.element_id IS NOT NULL) AS node_ids
	  FROM testzonepoints p
	  JOIN PointToWitness w 
	    ON p.element_id = w.element_id 
        AND p.type = w.type
	   AND p.element_sub_id = w.element_sub_id
	   AND p.element_sub_sub_id = w.element_sub_sub_id
	  LEFT JOIN testnodes n 
	    ON ST_SnapToGrid(n.geom, 1e-8) = ST_SnapToGrid(w.cluster_geom, 1e-8) OR ST_SnapToGrid(n.geom, 1e-8) = ST_SnapToGrid(p.geom, 1e-8)
      WHERE p.type = 'core'
	  GROUP BY p.source, p.element_id, p.element_sub_id
	)
	-- Step 2: Separate outer rings
	, outer_and_inners AS (
	  SELECT p.source, p.element_id, 
	         (ARRAY_AGG(new_ring_geom) 
	           FILTER (WHERE element_sub_id = 1))[1] AS new_outer_ring,
			 COALESCE(
			    ARRAY_AGG(new_ring_geom) FILTER (WHERE element_sub_id > 1), --maybe null or what we want
			    (ARRAY_AGG(new_ring_geom))[0:-1] -- empty ring	
			) as new_inner_rings,
			p.node_ids
	  FROM ring_lines p
	  GROUP BY p.source, p.element_id,p.node_ids
	)
	, polygons as (
		-- Step 3: Reconstruct the polygons
		SELECT p.source, p.element_id, p.node_ids,
		       ST_MakePolygon(new_outer_ring, new_inner_rings) AS newgeom
		FROM outer_and_inners p
	)
	, witnesspolygon as (
		SELECT DISTINCT ON (p1.source, p1.element_id)
		       p1.source, p1.element_id as id,
			   p2.newgeom,
			   p2.node_ids
		FROM polygons p1, polygons p2
	    WHERE  ST_IsValid(p1.newgeom) AND ST_IsValid(p2.newgeom) 
		AND ST_Area(ST_Union(p1.newgeom, p2.newgeom)) > 0
		AND (ST_Area(ST_intersection(p1.newgeom, p2.newgeom)) / NULLIF(ST_Area(ST_Union(p1.newgeom, p2.newgeom)), 0)) > 0.7
		ORDER BY p1.source, p1.element_id, p2.newgeom
	)
	SELECT * FROM witnesspolygon
	UNION ALL
	-- get the singletons that did not intersect anything
	SELECT p.source, p.element_id as id, p.newgeom , p.node_ids
	FROM polygons p
	WHERE (p.source, p.element_id) NOT IN (
	  SELECT w.source, w.id FROM witnesspolygon w
	);
	
	CREATE INDEX ON UnionZones (id);

	-- show test output
	CREATE TEMP TABLE WitnessZones ON COMMIT DROP AS 
	SELECT DISTINCT ON(newgeom) newgeom, node_ids, id FROM UnionZones;

	CREATE INDEX ON WitnessZones (id);

	CREATE TEMP TABLE FinalZones ON COMMIT DROP AS 
	SELECT newgeom as loc, id, z.feature, content.dedup_consecutive(wz.node_ids) as node_ids
	FROM WitnessZones wz 
	JOIN testzones z on wz.id = z.element_id;

	CREATE INDEX ON FinalZones (node_ids);

	CREATE TEMP TABLE new_export_zones ON COMMIT DROP AS
	SELECT DISTINCT ON (fz.id)
        fz.id,
        fz.loc AS loc,
        jsonb_build_object(
            'type', 'Feature',
            'geometry', ST_AsGeoJSON(fz.loc, 15)::json,
            'properties', 
            jsonb_build_object('_id', fz.id::text) || 
            ((fz.feature::jsonb->'properties') - '_w_id' - '_id')
			|| jsonb_build_object('_w_id', fz.node_ids)
        ) AS feature
	FROM FinalZones fz;
	
    CREATE INDEX ON new_export_zones (id);
    CREATE INDEX ON new_export_zones USING GIST (loc);

	RAISE NOTICE 'Ending Zone processing at: %', clock_timestamp();
	
    ------------------------------ Reconstruct Nodes -------------------------------------
    RAISE NOTICE 'Start Reconstruct Nodes at: %', clock_timestamp();
	CREATE TEMP TABLE new_export_nodes ON COMMIT DROP AS
    SELECT DISTINCT ON (n.element_id)
        n.element_id as id,
        p.cluster_geom AS loc,
        jsonb_build_object(
            'type', 'Feature',
            'geometry', ST_AsGeoJSON(p.cluster_geom, 15)::json,
            'properties', 
            jsonb_build_object('_id', n.element_id::text) || 
            ((n.feature::jsonb->'properties') - '_id')
        ) AS feature
    FROM PointToWitness p
    JOIN testnodes n 
        ON p.element_id = n.element_id
        AND p.type = n.type
        -- AND p.element_sub_id = 0
        -- AND n.tdei_dataset_id = p.source
    -- WHERE p.element_sub_id = 0;
    WHERE p.type = 'core';
	
    CREATE INDEX ON new_export_nodes (id);
    CREATE INDEX ON new_export_nodes USING GIST (loc);
	RAISE NOTICE 'Ending Reconstruct Nodes at: %', clock_timestamp();
    ------------------------------ Reconstruct Edges -------------------------------------
    RAISE NOTICE 'Start Reconstruct Edges at: %', clock_timestamp();
	CREATE TEMP TABLE reconstructed_edges ON COMMIT DROP AS
    WITH edge_points AS (
        SELECT 
            p.element_id,
            p.source,
            ST_MakeLine(p.cluster_geom ORDER BY p.element_sub_id) AS loc
        FROM PointToWitness p
        WHERE p.type = 'core'
        -- WHERE p.element_sub_id > 0
        GROUP BY p.element_id, p.source
    ), 
	filtered_edges AS (
	    SELECT 
	        ep.element_id AS id,
	        ep.source,
	        ep.loc,
	        e.feature
	    FROM edge_points ep
	    JOIN testedges e 
	        ON e.element_id = ep.element_id AND e.source = ep.source
	    WHERE 
	        ST_NPoints(loc) > 1 -- Ensures LineString is valid
	        AND ST_Length(loc) > 0 -- Avoids collapsed geometries
	)
	SELECT * FROM filtered_edges;

    CREATE INDEX ON reconstructed_edges (id);
    CREATE INDEX ON reconstructed_edges USING GIST (loc);

	-- Precompute edge endpoint node IDs
  	-- Extract start and end points once
	CREATE TEMP TABLE edge_vertices ON COMMIT DROP AS
	SELECT 
		id,
		ST_SnapToGrid(ST_StartPoint(loc), 1e-8) AS start_loc,
		ST_SnapToGrid(ST_EndPoint(loc), 1e-8) AS end_loc
	FROM reconstructed_edges;
	
	CREATE INDEX ON edge_vertices (start_loc);
	CREATE INDEX ON edge_vertices (end_loc);
	
	-- Join with nodes using indexed spatial equality
	CREATE TEMP TABLE edge_endpoints ON COMMIT DROP AS
	SELECT 
		ev.id,
		ns.id::text AS u_id,
		ne.id::text AS v_id
	FROM edge_vertices ev
	LEFT JOIN new_export_nodes ns
		ON ST_SnapToGrid(ns.loc, 1e-8) = ev.start_loc
	LEFT JOIN new_export_nodes ne
		ON ST_SnapToGrid(ne.loc, 1e-8) = ev.end_loc;

    CREATE INDEX ON edge_endpoints (id);

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
                '_u_id', ep.u_id,
                '_v_id', ep.v_id
            ) || (COALESCE(e.feature::jsonb->'properties', '{}'::jsonb) - '_id' - '_u_id' - '_v_id')
        ) AS feature,
        ROW_NUMBER() OVER (ORDER BY e.id) AS seq_id
    FROM reconstructed_edges e
	JOIN edge_endpoints ep ON e.id = ep.id;

    RAISE NOTICE 'Ending Reconstruct Edges at: %', clock_timestamp();

    ------------------------------------------------
    ---End: Reconstruct core files ---
    ------------------------------------------------
	
    ------------------------------------------------
    ---Start: Reconstruct Extension file ---
    ------------------------------------------------
     ------------------------------ Reconstruct Polygons -------------------------------------
    RAISE NOTICE 'Stating Polygons processing at: %', clock_timestamp();

	-- Step 1: Reaggregate witness points to build new rings as a LINESTRING
	CREATE TEMP TABLE ext_ring_lines ON COMMIT DROP AS
	SELECT 
	    p.source, 
	    p.element_id, 
	    p.element_sub_id,
	    ST_MakeLine(p.geom ORDER BY p.element_sub_sub_id) AS old_ring_geom,
	    ST_MakeLine(w.cluster_geom ORDER BY w.element_sub_sub_id) AS new_ring_geom
	FROM ext_polygonpoints p
	JOIN PointToWitness w 
	  ON p.element_id = w.element_id 
	  AND p.type = w.type
	  AND p.element_sub_id = w.element_sub_id
	  AND p.element_sub_sub_id = w.element_sub_sub_id
	WHERE p.type = 'extension_polygon' 
	  AND w.type = 'extension_polygon'
	GROUP BY p.source, p.element_id, p.element_sub_id;

	-- Step 2: Separate outer rings
	CREATE TEMP TABLE ext_outer_and_inners ON COMMIT DROP AS
	SELECT p.source, p.element_id, 
	       (ARRAY_AGG(new_ring_geom) 
	         FILTER (WHERE element_sub_id = 1))[1] AS new_outer_ring,
	       COALESCE(
	          ARRAY_AGG(new_ring_geom) FILTER (WHERE element_sub_id > 1),
	          (ARRAY_AGG(new_ring_geom))[0:-1]
	       ) AS new_inner_rings
	FROM ext_ring_lines p
	GROUP BY p.source, p.element_id;

-- Step 2.5: Filter out invalid or unclosed rings before reconstruction
	CREATE TEMP TABLE ext_valid_outer_and_inners ON COMMIT DROP AS
	SELECT *
	FROM ext_outer_and_inners
	WHERE 
	  ST_IsClosed(new_outer_ring)
	  AND ST_NPoints(new_outer_ring) >= 4
	  AND ST_IsValid(new_outer_ring);
	-- FOR rec IN
 --        SELECT source, element_id, new_outer_ring
 --        FROM ext_outer_and_inners
 --        WHERE NOT ST_IsClosed(new_outer_ring) 
 --           OR NOT ST_IsValid(new_outer_ring)
 --    LOOP
 --        RAISE NOTICE 'Problematic polygon: source=%, element_id=%', rec.source, rec.element_id;
 --        RAISE NOTICE 'Ring WKT: %', ST_AsText(rec.new_outer_ring);
 --    END LOOP;
	
	-- Step 3: Reconstruct the polygons
	CREATE TEMP TABLE ext_polygons_reconstructed ON COMMIT DROP AS
	SELECT p.source, p.element_id,
	       ST_MakePolygon(new_outer_ring, new_inner_rings) AS newgeom
	FROM ext_valid_outer_and_inners p;

	-- Step 4: Build witness polygons based on intersection
	CREATE TEMP TABLE witnesspolygon ON COMMIT DROP AS
	SELECT DISTINCT ON (p1.source, p1.element_id)
	       p1.source, p1.element_id AS id,
	       p2.newgeom
	FROM ext_polygons_reconstructed p1, ext_polygons_reconstructed p2
	WHERE ST_IsValid(p1.newgeom) AND ST_IsValid(p2.newgeom) 
	AND ST_Area(ST_Union(p1.newgeom, p2.newgeom)) > 0
    AND ST_Area(ST_intersection(p1.newgeom, p2.newgeom)) / ST_Area(ST_Union(p1.newgeom, p2.newgeom)) > 0.7
	ORDER BY p1.source, p1.element_id, p2.newgeom;

	-- Step 5: Final union table
	CREATE TEMP TABLE UnionPolygons ON COMMIT DROP AS
	SELECT * FROM witnesspolygon
	UNION ALL
	SELECT p.source, p.element_id AS id, p.newgeom
	FROM ext_polygons_reconstructed p
	WHERE (p.source, p.element_id) NOT IN (
	  SELECT w.source, w.id FROM witnesspolygon w
	);

	-- Index for faster access
	CREATE INDEX ON UnionPolygons (id);

	-- show test output
	CREATE TEMP TABLE WitnessPolygons ON COMMIT DROP AS 
	SELECT DISTINCT ON(newgeom) newgeom, id FROM UnionPolygons;

	CREATE INDEX ON WitnessPolygons (id);

	CREATE TEMP TABLE FinalPolygons ON COMMIT DROP AS 
	SELECT newgeom as loc, id, z.feature
	FROM WitnessPolygons wz 
	JOIN ext_polygons z on wz.id = z.element_id;

	CREATE TEMP TABLE new_export_polygons ON COMMIT DROP AS
	SELECT DISTINCT ON (fz.id)
        fz.id,
        fz.loc AS loc,
        jsonb_build_object(
            'type', 'Feature',
            'geometry', ST_AsGeoJSON(fz.loc, 15)::json,
            'properties', 
            jsonb_build_object('_id', fz.id::text) || 
            ((fz.feature::jsonb->'properties') - '_w_id' - '_id')
        ) AS feature
	FROM FinalPolygons fz;
	
    CREATE INDEX ON new_export_polygons (id);
    CREATE INDEX ON new_export_polygons USING GIST (loc);

	RAISE NOTICE 'Ending Polygons processing at: %', clock_timestamp();
	
    ------------------------------ Reconstruct Points -------------------------------------
    RAISE NOTICE 'Start Reconstruct Points at: %', clock_timestamp();
	CREATE TEMP TABLE new_export_points ON COMMIT DROP AS
    SELECT DISTINCT ON (n.element_id)
        n.element_id as id,
        p.cluster_geom AS loc,
        jsonb_build_object(
            'type', 'Feature',
            'geometry', ST_AsGeoJSON(p.cluster_geom, 15)::json,
            'properties', 
            jsonb_build_object('_id', n.element_id::text) || 
            ((n.feature::jsonb->'properties') - '_id')
        ) AS feature
    FROM PointToWitness p
    JOIN ext_points n 
        ON p.element_id = n.element_id
        AND p.type = n.type
        -- AND p.element_sub_id = 0
        -- AND n.tdei_dataset_id = p.source
    -- WHERE p.element_sub_id = 0;
    WHERE p.type = 'extension_point';
	
    CREATE INDEX ON new_export_points (id);
    CREATE INDEX ON new_export_points USING GIST (loc);
	RAISE NOTICE 'Ending Reconstruct Points at: %', clock_timestamp();
    ------------------------------ Reconstruct Lines -------------------------------------
    RAISE NOTICE 'Start Reconstruct Lines at: %', clock_timestamp();
	CREATE TEMP TABLE reconstructed_lines ON COMMIT DROP AS
    WITH ext_edge_points AS (
        SELECT 
            p.element_id,
            p.source,
            ST_MakeLine(p.cluster_geom ORDER BY p.element_sub_id) AS loc
        FROM PointToWitness p
        WHERE p.type = 'extension_line'
        -- WHERE p.element_sub_id > 0
        GROUP BY p.element_id, p.source
    ), 
	filtered_ext_edges AS (
	    SELECT 
	        ep.element_id AS id,
	        ep.source,
	        ep.loc,
	        e.feature
	    FROM ext_edge_points ep
	    JOIN ext_lines e 
	        ON e.element_id = ep.element_id AND e.source = ep.source
	    WHERE 
	        ST_NPoints(loc) > 1 -- Ensures LineString is valid
	        AND ST_Length(loc) > 0 -- Avoids collapsed geometries
	)
	SELECT * FROM filtered_ext_edges;

    CREATE INDEX ON reconstructed_lines (id);
    CREATE INDEX ON reconstructed_lines USING GIST (loc);

	-- Precompute edge endpoint node IDs
  	-- Extract start and end points once
	CREATE TEMP TABLE ext_line_vertices ON COMMIT DROP AS
	SELECT 
		id,
		ST_SnapToGrid(ST_StartPoint(loc), 1e-8) AS start_loc,
		ST_SnapToGrid(ST_EndPoint(loc), 1e-8) AS end_loc
	FROM reconstructed_lines;
	
	CREATE INDEX ON ext_line_vertices (start_loc);
	CREATE INDEX ON ext_line_vertices (end_loc);
	
	-- Join with nodes using indexed spatial equality
	CREATE TEMP TABLE ext_line_endpoints ON COMMIT DROP AS
	SELECT 
		ev.id,
		ns.id::text AS u_id,
		ne.id::text AS v_id
	FROM ext_line_vertices ev
	LEFT JOIN new_export_nodes ns
		ON ST_SnapToGrid(ns.loc, 1e-8) = ev.start_loc
	LEFT JOIN new_export_nodes ne
		ON ST_SnapToGrid(ne.loc, 1e-8) = ev.end_loc;

    CREATE INDEX ON ext_line_endpoints (id);

    -- Rebuild edge node IDs
    CREATE TEMP TABLE feature_ext_lines ON COMMIT DROP AS
    SELECT DISTINCT ON (e.id)
        e.id AS edge_id,
        jsonb_build_object(
            'type', 'Feature',
            'geometry', ST_AsGeoJSON(e.loc, 15)::json,
            'properties',
            jsonb_build_object(
                '_id', ROW_NUMBER() OVER (ORDER BY e.id)::text,
                '_u_id', ep.u_id,
                '_v_id', ep.v_id
            ) || (COALESCE(e.feature::jsonb->'properties', '{}'::jsonb) - '_id' - '_u_id' - '_v_id')
        ) AS feature,
        ROW_NUMBER() OVER (ORDER BY e.id) AS seq_id
    FROM reconstructed_lines e
	JOIN ext_line_endpoints ep ON e.id = ep.id;

    RAISE NOTICE 'Ending Reconstruct Lines at: %', clock_timestamp();
    ------------------------------------------------
    ---End: Reconstruct Extension file ---
    ------------------------------------------------

    ------------------------------------------------
    ---Start: Export core files ---
    ------------------------------------------------

	------------------------------ Export Nodes -------------------------------------
    RAISE NOTICE 'Starting Export Nodes at: %', clock_timestamp();
	-- SELECT COUNT(*) INTO row_count FROM new_export_nodes;
 	-- RAISE NOTICE 'The table nodes has % rows.', row_count;

    SELECT jsonb_object_agg(key, TRUE)
    INTO node_mixed_type_keys
    FROM (
        SELECT DISTINCT key
        FROM new_export_nodes e, jsonb_each(COALESCE(e.feature::jsonb->'properties', '{}'::jsonb)) prop
        WHERE key LIKE 'ext:%'
        GROUP BY key
        HAVING COUNT(DISTINCT jsonb_typeof(value)) > 1
    ) sub;

	IF node_mixed_type_keys IS NOT NULL THEN
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
	END IF;

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
    RAISE NOTICE 'Ending Export Nodes at: %', clock_timestamp();
    ------------------------------ Export Edges -------------------------------------
    RAISE NOTICE 'Starting Export Edges at: %', clock_timestamp();
	-- SELECT COUNT(*) INTO row_count FROM feature_edges;
 --    RAISE NOTICE 'The table edges has % rows.', row_count;

    SELECT jsonb_object_agg(key, TRUE)
    INTO edge_mixed_type_keys
    FROM (
        SELECT DISTINCT key
        FROM feature_edges e, jsonb_each(COALESCE(e.feature::jsonb->'properties', '{}'::jsonb)) prop
        WHERE key LIKE 'ext:%'
        GROUP BY key
        HAVING COUNT(DISTINCT jsonb_typeof(value)) > 1
    ) sub;

	IF edge_mixed_type_keys IS NOT NULL THEN
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
	END IF;

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
    RAISE NOTICE 'Ending Export Edges at: %', clock_timestamp();

	------------------------------ Export Zones -------------------------------------
          
    RAISE NOTICE 'Starting Export Zones at: %', clock_timestamp();

	SELECT jsonb_object_agg(key, TRUE)
    INTO zone_mixed_type_keys
    FROM (
		SELECT DISTINCT key
		FROM new_export_zones e
		LEFT JOIN LATERAL jsonb_each(COALESCE(e.feature::jsonb->'properties', '{}'::jsonb)) AS prop(key, value)
		ON TRUE
		WHERE key LIKE 'ext:%'
		GROUP BY key
		HAVING COUNT(DISTINCT jsonb_typeof(value)) > 1
    ) subquery;

	UPDATE new_export_zones 
    SET feature = jsonb_set(
        feature::jsonb, 
        '{properties}', 
        (
            SELECT jsonb_object_agg(
                key, 
                CASE 
                    -- Convert only keys in zone_mixed_type_keys and that are not already strings
                    WHEN zone_mixed_type_keys ? key AND jsonb_typeof(value) != 'string' 
                    THEN to_jsonb(value::text)  
                    ELSE value
                END
            )
            FROM jsonb_each(feature::jsonb->'properties')  -- Keep all properties
        )
    )
    WHERE feature::jsonb ? 'properties'  -- Update only rows where 'properties' exists
    AND EXISTS (
        SELECT 1 FROM jsonb_each(feature::jsonb->'properties') WHERE key LIKE 'ext:%'
    ); 

	fname := 'zone';
    result_cursor := 'zone_cursor';
	OPEN result_cursor FOR 		
		SELECT feature
		FROM new_export_zones
		WHERE feature is not null
		ORDER by id ASC;
	file_name := fname;
    cursor_ref := result_cursor;
    RETURN NEXT;
    RAISE NOTICE 'Ending Export Zones at: %', clock_timestamp();

    ------------------------------------------------
    ---End: Export core files ---
    ------------------------------------------------

    ------------------------------------------------
    ---Start: Export extension files ---
    ------------------------------------------------
------------------------------ Export Extension Points -------------------------------------
    RAISE NOTICE 'Starting Export Extension Points at: %', clock_timestamp();

    SELECT jsonb_object_agg(key, TRUE)
    INTO point_mixed_type_keys
    FROM (
        SELECT DISTINCT key
        FROM new_export_points e, jsonb_each(COALESCE(e.feature::jsonb->'properties', '{}'::jsonb)) prop
        WHERE key LIKE 'ext:%'
        GROUP BY key
        HAVING COUNT(DISTINCT jsonb_typeof(value)) > 1
    ) sub;

	IF point_mixed_type_keys IS NOT NULL THEN
    UPDATE new_export_points
    SET feature = jsonb_set(
        feature,
        '{properties}',
        (SELECT jsonb_object_agg(
            key,
            CASE WHEN point_mixed_type_keys ? key AND jsonb_typeof(value) != 'string'
                 THEN to_jsonb(value::text)
                 ELSE value
            END)
         FROM jsonb_each(feature::jsonb->'properties'))
    )
    WHERE EXISTS (
        SELECT 1 FROM jsonb_each(feature::jsonb->'properties') WHERE key LIKE 'ext:%'
    );
	END IF;

    fname := 'point';
    result_cursor := 'point_cursor';
    OPEN result_cursor FOR
        SELECT feature
        FROM new_export_points
        WHERE feature IS NOT NULL
        ORDER BY id;
    file_name := fname;
    cursor_ref := result_cursor;
    RETURN NEXT;
    RAISE NOTICE 'Ending Export Extension Points at: %', clock_timestamp();
    ------------------------------ Export Lines -------------------------------------
    RAISE NOTICE 'Starting Export Extension Lines at: %', clock_timestamp();

    SELECT jsonb_object_agg(key, TRUE)
    INTO line_mixed_type_keys
    FROM (
        SELECT DISTINCT key
        FROM feature_ext_lines e, jsonb_each(COALESCE(e.feature::jsonb->'properties', '{}'::jsonb)) prop
        WHERE key LIKE 'ext:%'
        GROUP BY key
        HAVING COUNT(DISTINCT jsonb_typeof(value)) > 1
    ) sub;

	IF line_mixed_type_keys IS NOT NULL THEN
    UPDATE feature_ext_lines
    SET feature = jsonb_set(
        feature,
        '{properties}',
        (SELECT jsonb_object_agg(
            key,
            CASE WHEN line_mixed_type_keys ? key AND jsonb_typeof(value) != 'string'
                 THEN to_jsonb(value::text)
                 ELSE value
            END)
         FROM jsonb_each(feature::jsonb->'properties'))
    )
    WHERE EXISTS (
        SELECT 1 FROM jsonb_each(feature::jsonb->'properties') WHERE key LIKE 'ext:%'
    );
	END IF;

    fname := 'line';
    result_cursor := 'line_cursor';
    OPEN result_cursor FOR
        SELECT feature
        FROM feature_ext_lines
        WHERE feature IS NOT NULL
        ORDER BY seq_id;
    file_name := fname;
    cursor_ref := result_cursor;
    RETURN NEXT;
    RAISE NOTICE 'Ending Export Extension Lines at: %', clock_timestamp();

	------------------------------ Export Extension Polygons -------------------------------------
          
    RAISE NOTICE 'Starting Export Extension Polygons at: %', clock_timestamp();

	SELECT jsonb_object_agg(key, TRUE)
    INTO polygon_mixed_type_keys
    FROM (
		SELECT DISTINCT key
		FROM new_export_polygons e
		LEFT JOIN LATERAL jsonb_each(COALESCE(e.feature::jsonb->'properties', '{}'::jsonb)) AS prop(key, value)
		ON TRUE
		WHERE key LIKE 'ext:%'
		GROUP BY key
		HAVING COUNT(DISTINCT jsonb_typeof(value)) > 1
    ) subquery;

	UPDATE new_export_polygons 
    SET feature = jsonb_set(
        feature::jsonb, 
        '{properties}', 
        (
            SELECT jsonb_object_agg(
                key, 
                CASE 
                    -- Convert only keys in zone_mixed_type_keys and that are not already strings
                    WHEN polygon_mixed_type_keys ? key AND jsonb_typeof(value) != 'string' 
                    THEN to_jsonb(value::text)  
                    ELSE value
                END
            )
            FROM jsonb_each(feature::jsonb->'properties')  -- Keep all properties
        )
    )
    WHERE feature::jsonb ? 'properties'  -- Update only rows where 'properties' exists
    AND EXISTS (
        SELECT 1 FROM jsonb_each(feature::jsonb->'properties') WHERE key LIKE 'ext:%'
    ); 

	fname := 'polygon';
    result_cursor := 'polygon_cursor';
	OPEN result_cursor FOR 		
		SELECT feature
		FROM new_export_polygons
		WHERE feature is not null
		ORDER by id ASC;
	file_name := fname;
    cursor_ref := result_cursor;
    RETURN NEXT;
    RAISE NOTICE 'Ending Export Extension Polygons at: %', clock_timestamp();
    ------------------------------------------------
    ---End: Export extension files ---
    ------------------------------------------------

    RETURN;
END;
$BODY$;

ALTER FUNCTION content.tdei_union_dataset(character varying, character varying, real)
    OWNER TO tdeiadmin;
