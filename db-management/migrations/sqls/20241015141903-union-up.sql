
CREATE
OR REPLACE FUNCTION CONTENT.tdei_union_dataset(
  src_one_tdei_dataset_id CHARACTER VARYING,
  src_two_tdei_dataset_id CHARACTER VARYING
)
RETURNS TABLE(edges json, nodes json, zones json, extensions_points json, extensions_lines json, extensions_polygons json) 
LANGUAGE 'plpgsql' COST 100 VOLATILE PARALLEL UNSAFE AS $BODY$
DECLARE
    zone_exists BOOLEAN;
    temp_row RECORD;
BEGIN
    ------------------------------ Nodes -------------------------------------
	-- Create temporary table to store node map
    CREATE TEMP TABLE temp_node_map AS
    WITH
    joined_nodes AS (
        -- self join on points to create equivalence classes
        SELECT U.id as uid, U.node_loc, R.id as rid, R.node_loc
        FROM content.node as U, content.node R
        WHERE U.tdei_dataset_id = SRC_ONE_TDEI_DATASET_ID
          AND R.tdei_dataset_id = SRC_TWO_TDEI_DATASET_ID
          AND ST_DISTANCE(ST_Transform(U.node_loc, 3857), ST_Transform(R.node_loc, 3857)) <= 0.5
    ),
    witness_nodes AS (
        -- assign every element to a specific element in group
        SELECT min(rid) as wid, uid
        FROM joined_nodes
        GROUP BY uid
    ),
    node_map AS (
        SELECT w.wid as newid, newpt.node_loc as newloc, newpt.feature as newfeature, w.uid as oldid, oldpt.node_loc as oldloc, oldpt.feature as oldfeature
        FROM witness_nodes w
        JOIN content.node newpt ON newpt.id = w.wid
        JOIN content.node oldpt ON oldpt.id = w.uid
        WHERE newpt.tdei_dataset_id IN (SRC_ONE_TDEI_DATASET_ID, SRC_TWO_TDEI_DATASET_ID)
          AND oldpt.tdei_dataset_id IN (SRC_ONE_TDEI_DATASET_ID, SRC_TWO_TDEI_DATASET_ID)
    )
    SELECT * FROM node_map; 
    
    CREATE TEMP TABLE temp_conflated_nodes AS
    WITH numbered_nodes AS (
        SELECT DISTINCT ON (newid, newloc) 
            newid AS id, 
            newloc AS loc, 
            newfeature AS feature
        FROM temp_node_map
        WHERE newid IS NOT NULL AND newloc IS NOT NULL
        -- The HAVING clause is not needed with DISTINCT ON
        ORDER BY newid, newloc
    ),
    sequence_nodes AS (
        SELECT 
            id, 
            loc, 
            feature,
            ROW_NUMBER() OVER (ORDER BY id) :: text AS id_sequence
        FROM numbered_nodes nd
    )
    SELECT 
        id, 
        loc, 
        id_sequence, 
        feature::jsonb
    FROM sequence_nodes;

  CREATE TEMP TABLE feature_nodes AS
   SELECT json_build_object(
            'type', 'Feature',
            'geometry', ST_AsGeoJSON(loc)::json,
             'properties', 
            ( jsonb_build_object( '_id', id_sequence::text ) 
                || ((feature->'properties') - '_id') 
            )
        ) AS feature
    FROM temp_conflated_nodes;
    
------------------------------ Edges -------------------------------------
	-- The lines we want in the output
    CREATE TEMP TABLE temp_repaired_edges AS
    WITH
    edge_vertices AS (
        SELECT l.id, (pt).geom as loc, (pt).path[1] as ord
        FROM content.edge l, ST_DUMPPOINTS(edge_loc) pt
        WHERE l.tdei_dataset_id IN (SRC_ONE_TDEI_DATASET_ID, SRC_TWO_TDEI_DATASET_ID)
    ),
    replaced_nodes AS (
        SELECT l.id as lineid, COALESCE(p.newloc, l.loc) as loc, l.ord
        FROM edge_vertices l
        LEFT OUTER JOIN temp_node_map p ON ST_Equals(l.loc, p.oldloc)
    ),
    reconstruct_edge AS (
        SELECT l.lineid as id, ST_MakeLine(l.loc ORDER BY ord ASC) as loc
        FROM replaced_nodes l
        GROUP BY l.lineid
    ),
    new_edge AS (
        SELECT l.id, l.loc, newedge.feature
        FROM reconstruct_edge l
        JOIN content.edge newedge on l.id = newedge.id
    )
    SELECT * FROM new_edge;

    -- Conflate edges by identifying unique start and end points
    CREATE TEMP TABLE temp_conflated_edges ON COMMIT DROP AS
    WITH 
    edge_loc_start_end AS (
        SELECT ST_StartPoint(l.loc) as s, ST_EndPoint(l.loc) as e, l.id, l.loc
        FROM temp_repaired_edges l
    ),
    witness AS (
        -- find a witness for each equivalence class
        SELECT s, e, min(id) as wid
        FROM edge_loc_start_end
        GROUP BY s, e
    ),
    -- Conflate edges: group by start and end points, and merge overlapping edges
    conflated_edges AS (
        SELECT 
            w.s, w.e, min(w.wid) as wid,
            ST_LineMerge(ST_Union(l.loc)) AS conflated_loc  -- Merge overlapping lines
        FROM witness w
        JOIN edge_loc_start_end l 
            ON (ST_Equals(w.s, l.s) AND ST_Equals(w.e, l.e))  -- Match by start and end points
        GROUP BY w.s, w.e  -- Group by the unique start and end points
    )
    -- SELECT wid as id, loc
    -- FROM witness w
    -- JOIN temp_repaired_edges l ON w.wid = l.id;
  SELECT 
    w.wid AS id,  
    w.conflated_loc AS loc, 
    l.feature::jsonb,
    ROW_NUMBER() OVER (ORDER BY w.wid) AS id_sequence
    FROM conflated_edges w
    LEFT JOIN (
        SELECT DISTINCT ON (id) id, feature 
        FROM temp_repaired_edges
        ORDER BY id  -- Optionally, you can add a secondary ordering criterion
    ) l ON w.wid = l.id;


     CREATE TEMP TABLE feature_edges AS
   SELECT json_build_object(
            'type', 'Feature',
            'geometry', ST_AsGeoJSON(loc)::json,
             'properties', 
            ( jsonb_build_object( '_id', id_sequence::text ) 
                || ((feature->'properties') - '_id') 
            )
        ) AS feature
    FROM temp_conflated_edges;
    
-- 	------------------------------ POLYGON -------------------------------------

-- Check if there are records in content.zone for the given dataset IDs
    SELECT EXISTS (
        SELECT 1 
        FROM content.zone l
        WHERE l.tdei_dataset_id IN (SRC_ONE_TDEI_DATASET_ID, SRC_TWO_TDEI_DATASET_ID)
    ) INTO zone_exists;
    
    IF zone_exists THEN
    	CREATE TEMP TABLE temp_repaired_polygon AS
    	  -- For each line, map any old points to its new point 
    	  -- and rebuild the line accordingly
    	WITH
    	  polygon_vertices as (
    	SELECT l.id, (pt).geom as loc, (pt).path[1] as ring, (pt).path[2] as ord 
    	FROM content.zone l, ST_DUMPPOINTS(zone_loc) pt
     	WHERE l.tdei_dataset_id IN (SRC_ONE_TDEI_DATASET_ID, SRC_TWO_TDEI_DATASET_ID)
    
    	),
    	replaced_polygon as (
    		SELECT l.id as pid, COALESCE(p.newloc, l.loc) as loc, l.ring, l.ord
    	  	FROM polygon_vertices l 
    		LEFT OUTER JOIN temp_node_map p ON ST_Equals(l.loc, p.oldloc)
    	),
    	makerings as (
    		SELECT l.pid as id, l.ring, ST_MakeLine(l.loc ORDER BY ord desc) as ringloc
    		FROM replaced_polygon l
    		GROUP BY l.pid, l.ring
    	),
    	reconstruct_polygon as (
    	SELECT m.id, ST_BuildArea(ST_Collect(ringloc)) as loc
    	  FROM makerings m
    	GROUP BY m.id
    	),
    	new_polygon as (
    	SELECT rp.id, rp.loc, newZone.feature
    	  FROM reconstruct_polygon rp
    	 JOIN content.zone newZone on rp.id = newZone.id
    	)
    	SELECT * FROM new_polygon;
    
    	CREATE TEMP TABLE temp_conflated_polygons AS
            WITH 
            unique_poly as (
              SELECT min(id) as id, loc
                FROM temp_repaired_polygon
            GROUP BY loc
            ), 
            joined as (
              SELECT a.id as aid, b.id as bid 
                FROM unique_poly a, unique_poly b
              WHERE a.id < b.id 
                 AND content.union_matchpoly(a.loc, b.loc, .75)
            ),
            witness as (
              SELECT min(aid) as aid, bid 
              FROM joined
              GROUP BY bid
            ),
            conflatedpoly as (
              SELECT id as id FROM temp_repaired_polygon  -- all polys
              EXCEPT
              SELECT bid FROM witness  -- those that are mapped to a witness
            ),
            finalpoly as 
            ( SELECT p.*, ROW_NUMBER() OVER () AS id_sequence
              FROM conflatedpoly c, unique_poly p
             WHERE c.id = p.id 
             )
             SELECT 
            w.id,  
            w.loc, 
            l.feature::jsonb,
            ROW_NUMBER() OVER (ORDER BY w.id) AS id_sequence
            FROM finalpoly w
            LEFT JOIN (
                SELECT DISTINCT ON (id) id, feature 
                FROM temp_repaired_polygon
                ORDER BY id  
            ) l ON w.id = l.id;
    
     CREATE TEMP TABLE feature_polygon AS
   SELECT json_build_object(
            'type', 'Feature',
            'geometry', ST_AsGeoJSON(loc)::json,
             'properties', 
            ( jsonb_build_object( '_id', id_sequence::text ) 
                || ((feature->'properties') - '_id') 
            )
        ) AS feature
    FROM temp_conflated_polygons;
    
   END IF; 
      ------------------------------ Export NODES -------------------------------------
  
     -- Iterate over intersected edges
    FOR temp_row IN
        SELECT feature
        FROM feature_nodes
    LOOP
        edges := null;
		nodes := temp_row.feature;
        zones := null;
		extensions_points := null;
		extensions_lines := null;
		extensions_polygons := null;
        RETURN NEXT;
    END LOOP;
    
    -- 	------------------------------ Export EDGES -------------------------------------

 -- Iterate over intersected edges
    FOR temp_row IN
        SELECT feature
        FROM feature_edges
    LOOP
        edges := temp_row.feature;
		nodes := null;
        zones := null;
		extensions_points := null;
		extensions_lines := null;
		extensions_polygons := null;
        RETURN NEXT;
    END LOOP;
    
    	------------------------------ Export Polygon -------------------------------------
          
        IF zone_exists THEN
            FOR temp_row IN
                SELECT feature
                FROM feature_polygons
            LOOP
            edges := null;
    		nodes := null;
            zones := temp_row.feature;
    		extensions_points := null;
    		extensions_lines := null;
    		extensions_polygons := null;
            RETURN NEXT;
        END LOOP;
      END IF; 


 -- Drop the temporary table
    DROP TABLE IF EXISTS temp_intersected_edges;
    DROP TABLE IF EXISTS temp_conflated_edges;
    DROP TABLE IF EXISTS temp_conflated_polygons;
    DROP TABLE IF EXISTS feature_edges;
    DROP TABLE IF EXISTS feature_edges;
    DROP TABLE IF EXISTS feature_polygons;
     
RETURN;
END;
$BODY$;