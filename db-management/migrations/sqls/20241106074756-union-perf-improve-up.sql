ALTER TABLE content.edge
ADD COLUMN edge_loc_3857 geometry(LineString, 3857) 
    GENERATED ALWAYS AS (
        ST_Transform(
            ST_GeomFromGeoJSON(feature ->> 'geometry'),
            3857
        )
    ) STORED;
	
CREATE INDEX idx_edge_loc_gist ON content.edge USING GIST (edge_loc_3857);

 ALTER TABLE content.node
ADD COLUMN node_loc_3857 geometry(Point, 3857) 
    GENERATED ALWAYS AS (
        CASE 
            WHEN (ST_X(ST_SetSRID(ST_GeomFromGeoJSON(feature ->> 'geometry'), 4326)) BETWEEN -180 AND 180)
             AND (ST_Y(ST_SetSRID(ST_GeomFromGeoJSON(feature ->> 'geometry'), 4326)) BETWEEN -90 AND 90)
            THEN  ST_Transform(
            ST_GeomFromGeoJSON(feature ->> 'geometry'),
            3857
        )
        ELSE NULL
        END
    ) STORED;
	
CREATE INDEX idx_node_loc_gist ON content.node USING GIST (node_loc_3857);

ALTER TABLE content.zone
ADD COLUMN zone_loc_3857 geometry(Polygon, 3857) 
    GENERATED ALWAYS AS (
        ST_Transform(
            ST_GeomFromGeoJSON(feature ->> 'geometry'),
            3857
        )
    ) STORED;
	
CREATE INDEX idx_zone_loc_gist ON content.zone USING GIST (zone_loc_3857);

CREATE OR REPLACE FUNCTION content.tdei_union_dataset_test(
	src_one_tdei_dataset_id character varying,
	src_two_tdei_dataset_id character varying)
    RETURNS TABLE(edges json, nodes json, zones json, extensions_points json, extensions_lines json, extensions_polygons json) 
    LANGUAGE 'plpgsql'
    COST 100
    VOLATILE PARALLEL UNSAFE
    ROWS 1000

AS $BODY$
DECLARE
    zone_exists BOOLEAN;
    temp_row RECORD;
    row_count BIGINT;
BEGIN
    ------------------------------ Nodes -------------------------------------
	-- RAISE NOTICE 'Node processing started at  % .', clock_timestamp();
	CREATE TEMP TABLE joined_nodes ON COMMIT DROP AS
	SELECT U.id as uid, U.node_loc as unode_loc, R.id as rid, R.node_loc as rnode_loc
	FROM content.node AS U
	JOIN content.node AS R   
	ON U.tdei_dataset_id = SRC_ONE_TDEI_DATASET_ID
	   AND R.tdei_dataset_id = SRC_TWO_TDEI_DATASET_ID
	   AND ST_Envelope(U.node_loc_3857) && ST_Envelope(R.node_loc_3857)   
	   AND ST_DWithin(U.node_loc_3857, R.node_loc_3857, 0.5);
	
	
	CREATE TEMP TABLE witness_nodes ON COMMIT DROP AS
	SELECT min(rid) as wid, uid
	FROM joined_nodes
	GROUP BY uid;
	
	CREATE TEMP TABLE temp_node_map ON COMMIT DROP AS
	SELECT 
		w.wid as newid, 
		newpt.node_loc as newloc, 
		newpt.feature as newfeature, 
		w.uid as oldid, 
		oldpt.node_loc as oldloc, 
		oldpt.feature as oldfeature
	FROM witness_nodes w
	JOIN content.node newpt ON newpt.id = w.wid
	JOIN content.node oldpt ON oldpt.id = w.uid
	WHERE newpt.tdei_dataset_id IN (SRC_ONE_TDEI_DATASET_ID, SRC_TWO_TDEI_DATASET_ID)
	  AND oldpt.tdei_dataset_id IN (SRC_ONE_TDEI_DATASET_ID, SRC_TWO_TDEI_DATASET_ID);
	
	-- Adding GIST indexes on `newloc` and `oldloc` in `temp_node_map`
	CREATE INDEX ON temp_node_map USING GIST (newloc);
	CREATE INDEX ON temp_node_map USING GIST (oldloc);
    
    CREATE TEMP TABLE temp_conflated_nodes ON COMMIT DROP AS
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

  CREATE TEMP TABLE feature_nodes ON COMMIT DROP AS
  SELECT 
  jsonb_build_object(
            'type', 'Feature',
            'geometry', ST_AsGeoJSON(loc)::json,
             'properties', 
            ( jsonb_build_object( '_id', id_sequence::text ) 
                || ((feature->'properties') - '_id') 
            )
        ) AS feature, 
		id_sequence as id
    FROM temp_conflated_nodes where feature is not null;

		-- RAISE NOTICE 'Node processing completed at  % .', clock_timestamp();

------------------------------ Edges -------------------------------------
		-- RAISE NOTICE 'Edge processing started at %.', clock_timestamp();

	CREATE TEMP TABLE edge_vertices ON COMMIT DROP AS
	SELECT l.id, (pt).geom AS loc, (pt).path[1] AS ord
	FROM content.edge l, ST_DUMPPOINTS(edge_loc) pt
	WHERE l.tdei_dataset_id IN (SRC_ONE_TDEI_DATASET_ID, SRC_TWO_TDEI_DATASET_ID);
	
	CREATE INDEX ON edge_vertices USING GIST(loc);
	
	CREATE TEMP TABLE replaced_nodes ON COMMIT DROP AS
	SELECT l.id AS lineid, COALESCE(p.newloc, l.loc) AS loc, l.ord
	FROM edge_vertices l
	LEFT OUTER JOIN temp_node_map p 
	    ON l.loc && p.oldloc AND ST_Equals(l.loc, p.oldloc);
	
	CREATE INDEX ON replaced_nodes(lineid);
	CREATE INDEX ON replaced_nodes USING GIST(loc);
	
	CREATE TEMP TABLE reconstruct_edge ON COMMIT DROP AS
	SELECT l.lineid AS id, ST_MakeLine(l.loc ORDER BY ord ASC) AS loc
	FROM replaced_nodes l
	GROUP BY l.lineid;
	
	CREATE INDEX ON reconstruct_edge(id);
	
	CREATE TEMP TABLE new_edge ON COMMIT DROP AS
	SELECT l.id, l.loc, newedge.feature
	FROM reconstruct_edge l
	JOIN content.edge newedge ON l.id = newedge.id;
	
	CREATE INDEX ON new_edge(id);
	
	CREATE TEMP TABLE temp_repaired_edges ON COMMIT DROP AS
	SELECT * from new_edge;

	CREATE INDEX ON temp_repaired_edges USING GIST(loc);

	CREATE TEMP TABLE edge_loc_start_end ON COMMIT DROP AS
	SELECT ST_StartPoint(l.loc) AS s, ST_EndPoint(l.loc) AS e, l.id, l.loc
	FROM temp_repaired_edges l;
	
	CREATE INDEX ON edge_loc_start_end USING GIST(s);
	CREATE INDEX ON edge_loc_start_end USING GIST(e);
	CREATE INDEX ON edge_loc_start_end(id);

	CREATE TEMP TABLE witness ON COMMIT DROP AS
	SELECT s, e, MIN(id) AS wid
	FROM edge_loc_start_end
	GROUP BY s, e;
	
	CREATE INDEX ON witness USING GIST(s);
	CREATE INDEX ON witness USING GIST(e);
	CREATE INDEX ON witness(wid);

	CREATE TEMP TABLE conflated_edges ON COMMIT DROP AS
	SELECT 
	w.s, w.e, MIN(w.wid) AS wid,
	ST_LineMerge(ST_Union(l.loc)) AS conflated_loc
	FROM witness w
	JOIN edge_loc_start_end l 
	ON ST_Equals(w.s, l.s) AND ST_Equals(w.e, l.e)
	GROUP BY w.s, w.e;

	CREATE INDEX ON conflated_edges(wid);
	CREATE INDEX ON conflated_edges USING GIST(conflated_loc);
 
	CREATE TEMP TABLE temp_conflated_edges ON COMMIT DROP AS
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
	
	CREATE TEMP TABLE feature_edges ON COMMIT DROP AS
	SELECT jsonb_build_object(
			'type', 'Feature',
			'geometry', ST_AsGeoJSON(loc)::json,
			 'properties', 
			( jsonb_build_object( '_id', id_sequence::text ) 
				|| ((feature->'properties') - '_id') 
			)
		) AS feature, id_sequence as id
	FROM temp_conflated_edges;
	
		-- RAISE NOTICE 'Edge processing completed at  % .', clock_timestamp();

-- 	------------------------------ POLYGON -------------------------------------
	-- RAISE NOTICE 'Polygon processing started at  % .', clock_timestamp();

-- Check if there are records in content.zone for the given dataset IDs
    SELECT EXISTS (
        SELECT 1 
        FROM content.zone l
        WHERE l.tdei_dataset_id IN (SRC_ONE_TDEI_DATASET_ID, SRC_TWO_TDEI_DATASET_ID) limit 1
    ) INTO zone_exists;

	 CREATE TEMP TABLE feature_polygons(
        feature json,
        id bigint
    );
	    RAISE NOTICE 'The table zones has % rows.', zone_exists;

    IF zone_exists THEN

		--   -- For each line, map any old points to its new point 
    	--   -- and rebuild the line accordingly
		CREATE TEMP TABLE polygon_vertices ON COMMIT DROP AS
		SELECT l.id, (pt).geom AS loc, (pt).path[1] AS ring, (pt).path[2] AS ord
		FROM content.zone l, ST_DUMPPOINTS(zone_loc) pt
		WHERE l.tdei_dataset_id IN (SRC_ONE_TDEI_DATASET_ID, SRC_TWO_TDEI_DATASET_ID);
		
		CREATE INDEX idx_polygon_vertices_loc ON polygon_vertices USING GIST(loc);
		CREATE INDEX idx_polygon_vertices_id ON polygon_vertices(id);

		CREATE TEMP TABLE replaced_polygon ON COMMIT DROP AS
		SELECT l.id AS pid, COALESCE(p.newloc, l.loc) AS loc, l.ring, l.ord
		FROM polygon_vertices l
		LEFT OUTER JOIN temp_node_map p ON l.loc && p.oldloc AND ST_Equals(l.loc, p.oldloc);
		
		CREATE INDEX idx_replaced_polygon_loc ON replaced_polygon USING GIST(loc);
		CREATE INDEX idx_replaced_polygon_pid ON replaced_polygon(pid);

		CREATE TEMP TABLE makerings ON COMMIT DROP AS
		SELECT l.pid AS id, l.ring, ST_MakeLine(l.loc ORDER BY ord DESC) AS ringloc
		FROM replaced_polygon l
		GROUP BY l.pid, l.ring;
		
		CREATE INDEX idx_makerings_ringloc ON makerings USING GIST(ringloc);
		CREATE INDEX idx_makerings_id ON makerings(id);

		CREATE TEMP TABLE reconstruct_polygon ON COMMIT DROP AS
		SELECT m.id, ST_BuildArea(ST_Collect(ringloc)) AS loc
		FROM makerings m
		GROUP BY m.id;
		
		CREATE INDEX idx_reconstruct_polygon_loc ON reconstruct_polygon USING GIST(loc);
		CREATE INDEX idx_reconstruct_polygon_id ON reconstruct_polygon(id);

		CREATE TEMP TABLE new_polygon ON COMMIT DROP AS
		SELECT rp.id, rp.loc, newZone.feature
		FROM reconstruct_polygon rp
		JOIN content.zone newZone ON rp.id = newZone.id;
		
		CREATE INDEX idx_new_polygon_loc ON new_polygon USING GIST(loc);
		CREATE INDEX idx_new_polygon_id ON new_polygon(id);

		CREATE TEMP TABLE temp_repaired_polygon ON COMMIT DROP AS
		SELECT * FROM new_polygon;

		CREATE TEMP TABLE unique_poly ON COMMIT DROP AS
		SELECT MIN(id) AS id, loc
		FROM temp_repaired_polygon
		GROUP BY loc;
		
		CREATE INDEX idx_unique_poly_loc ON unique_poly USING GIST(loc);
		CREATE INDEX idx_unique_poly_id ON unique_poly(id);

		CREATE TEMP TABLE joined ON COMMIT DROP AS
		SELECT a.id AS aid, b.id AS bid
		FROM unique_poly a, unique_poly b
		WHERE a.id < b.id
		AND content.union_matchpoly(a.loc, b.loc, 0.75);
		
		CREATE INDEX idx_joined_aid ON joined(aid);
		CREATE INDEX idx_joined_bid ON joined(bid);

		CREATE TEMP TABLE witness ON COMMIT DROP AS
		SELECT MIN(aid) AS aid, bid
		FROM joined
		GROUP BY bid;
		
		CREATE INDEX idx_witness_aid ON witness(aid);
		CREATE INDEX idx_witness_bid ON witness(bid);

		CREATE TEMP TABLE conflatedpoly ON COMMIT DROP AS
		SELECT id AS id FROM temp_repaired_polygon  -- all polys
		EXCEPT
		SELECT bid FROM witness; -- those that are mapped to a witness
		
		CREATE INDEX idx_conflatedpoly_id ON conflatedpoly(id);

		CREATE TEMP TABLE finalpoly ON COMMIT DROP AS
		SELECT p.*
		FROM conflatedpoly c
		JOIN unique_poly p ON c.id = p.id;
		
		CREATE INDEX idx_finalpoly_id ON finalpoly(id);
		CREATE INDEX idx_finalpoly_loc ON finalpoly USING GIST(loc);
    	CREATE TEMP TABLE temp_conflated_polygons ON COMMIT DROP AS
             SELECT 
            w.id,  
            w.loc, 
            l.feature::jsonb as feature,
            ROW_NUMBER() OVER (ORDER BY w.id) AS id_sequence
            FROM finalpoly w
            LEFT JOIN (
                SELECT DISTINCT ON (id) id, feature 
                FROM temp_repaired_polygon
                ORDER BY id  
            ) l ON w.id = l.id;
    
	     INSERT INTO feature_polygons( feature, id)
	   		SELECT 
			   jsonb_build_object(
	            'type', 'Feature',
	            'geometry', ST_AsGeoJSON(loc)::json,
	            'properties',
	            ( 
				jsonb_build_object( '_id', id_sequence::text ) 
	    			            || 
					((feature->'properties') - '_id') 
	            ))
			AS feature, 
			id_sequence as id
	    	FROM temp_conflated_polygons where feature is not null;
   END IF; 
   
    	-- RAISE NOTICE 'Polygon processing completed at  % .', clock_timestamp();

    -- 	------------------------------ Export EDGES -------------------------------------
    SELECT COUNT(*) INTO row_count FROM feature_edges;

    -- Print the row count
    RAISE NOTICE 'The table edges has % rows.', row_count;
    
 -- Iterate over intersected edges
    FOR temp_row IN
        SELECT feature::json
        FROM feature_edges
		WHERE feature is not null
		ORDER by id ASC
    LOOP
        edges := temp_row.feature;
		nodes := null;
        zones := null;
		extensions_points := null;
		extensions_lines := null;
		extensions_polygons := null;
        RETURN NEXT;
    END LOOP;

	   ------------------------------ Export NODES -------------------------------------
    SELECT COUNT(*) INTO row_count FROM feature_nodes;

    -- Print the row count
    RAISE NOTICE 'The table nodes has % rows.', row_count;
    
     -- Iterate over intersected edges
    FOR temp_row IN
        SELECT feature::json
        FROM feature_nodes
		WHERE feature is not null
		ORDER by id ASC
    LOOP
        edges := null;
		nodes := temp_row.feature;
        zones := null;
		extensions_points := null;
		extensions_lines := null;
		extensions_polygons := null;
        RETURN NEXT;
    END LOOP;
    	------------------------------ Export Polygon -------------------------------------
          
    -- IF zone_exists THEN
	SELECT COUNT(*) INTO row_count FROM feature_polygons;

	-- Print the row count
	RAISE NOTICE 'The table polygon has % rows.', row_count;

	FOR temp_row IN
		SELECT feature::json
		FROM feature_polygons
		WHERE feature is not null
		ORDER by id ASC
	LOOP
		edges := null;
		nodes := null;
		zones := temp_row.feature;
		extensions_points := null;
		extensions_lines := null;
		extensions_polygons := null;
		RETURN NEXT;
	END LOOP;

 -- Drop the temporary table
    DROP TABLE IF EXISTS temp_node_map;
    DROP TABLE IF EXISTS temp_conflated_nodes;
    DROP TABLE IF EXISTS feature_nodes;
    DROP TABLE IF EXISTS temp_repaired_edges;
    DROP TABLE IF EXISTS temp_conflated_edges;
    DROP TABLE IF EXISTS feature_edges;
    DROP TABLE IF EXISTS temp_repaired_polygon;
    DROP TABLE IF EXISTS temp_conflated_polygons;
    DROP TABLE IF EXISTS feature_polygons;
	DROP TABLE IF EXISTS edge_loc_start_end;
     
RETURN;
END;
$BODY$;