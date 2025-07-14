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
	result_cursor REFCURSOR; -- Unique cursor for edges
    fname TEXT;
	extension_files RECORD;	    
	row_count BIGINT;
	node_mixed_type_keys JSONB;
    edge_mixed_type_keys JSONB;
   	zone_mixed_type_keys JSONB;
BEGIN
    ------------------------------ Nodes -------------------------------------
	-- RAISE NOTICE 'Node processing started at  % .', clock_timestamp();
	CREATE TEMP TABLE joined_nodes ON COMMIT DROP AS
	SELECT U.id as uid, U.node_loc as unode_loc, R.id as rid, R.node_loc as rnode_loc
	FROM content.node AS U
	JOIN content.node AS R   
	ON U.tdei_dataset_id = SRC_ONE_TDEI_DATASET_ID
	   AND R.tdei_dataset_id = SRC_TWO_TDEI_DATASET_ID
	   AND ST_DWithin(U.node_loc_3857, R.node_loc_3857, proximity);
	
	
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

	-- RAISE NOTICE 'Node processing completed at  % .', clock_timestamp();

------------------------------ Edges -------------------------------------
		-- RAISE NOTICE 'Edge processing started at %.', clock_timestamp();

	CREATE TEMP TABLE edge_vertices ON COMMIT DROP AS
	SELECT l.id as edgeid, (pt).geom AS loc, (pt).path[1] AS ord
	FROM content.edge l, ST_DUMPPOINTS(edge_loc) pt
	WHERE l.tdei_dataset_id IN (SRC_ONE_TDEI_DATASET_ID, SRC_TWO_TDEI_DATASET_ID);
	
	CREATE INDEX ON edge_vertices USING GIST(loc);
	
	--*
	CREATE TEMP TABLE replaced_nodes ON COMMIT DROP AS
	SELECT l.edgeid, COALESCE(p.newloc, l.loc) AS loc, l.ord
	FROM edge_vertices l
	LEFT OUTER JOIN temp_node_map p 
	    ON l.loc && p.oldloc 
		-- AND ST_Equals(l.loc, p.oldloc)
		AND ST_SnapToGrid(l.loc, 0.00000001) = ST_SnapToGrid(p.oldloc, 0.00000001);
	
	CREATE INDEX ON replaced_nodes(edgeid);
	CREATE INDEX ON replaced_nodes USING GIST(loc);

	--- Rebuild Nodes SRC_ONE_TDEI_DATASET_ID & SRC_TWO_TDEI_DATASET_ID
	CREATE TEMP TABLE new_export_nodes ON COMMIT DROP AS
	SELECT DISTINCT ON (existing_node.id) existing_node.id as id, existing_node.node_loc as loc, 
	jsonb_build_object(
			'type', 'Feature',
			'geometry', ST_AsGeoJSON(existing_node.node_loc,15)::json,
			 'properties', 
			( jsonb_build_object( '_id', existing_node.id::text ) 
				|| ((existing_node.feature::jsonb->'properties') - '_id') 
			)
		) AS feature
	FROM replaced_nodes l
	LEFT OUTER JOIN content.node existing_node 
	    ON l.loc && existing_node.node_loc 
		-- AND ST_Equals(l.loc, existing_node.node_loc)
		AND ST_SnapToGrid(existing_node.node_loc, 0.00000001) = ST_SnapToGrid(l.loc, 0.00000001)
		and existing_node.tdei_dataset_id IN (SRC_ONE_TDEI_DATASET_ID) 
	WHERE existing_node.id is not null 
	order by existing_node.id;
	
	CREATE INDEX ON new_export_nodes(id);
	CREATE UNIQUE INDEX ON new_export_nodes(id);

	INSERT INTO new_export_nodes (id, loc, feature)
	SELECT DISTINCT ON (existing_node.id) existing_node.id as id, existing_node.node_loc as loc, 
	jsonb_build_object(
			'type', 'Feature',
			'geometry', ST_AsGeoJSON(existing_node.node_loc,15)::json,
			 'properties', 
			( jsonb_build_object( '_id', existing_node.id::text ) 
				|| ((existing_node.feature::jsonb->'properties') - '_id') 
			)
		) AS feature
	FROM replaced_nodes l
	LEFT OUTER JOIN content.node existing_node 
	    ON l.loc && existing_node.node_loc
		-- AND ST_Equals(l.loc, existing_node.node_loc)
		AND ST_SnapToGrid(existing_node.node_loc, 0.00000001) = ST_SnapToGrid(l.loc, 0.00000001)
		AND existing_node.tdei_dataset_id IN (SRC_TWO_TDEI_DATASET_ID)
	WHERE existing_node.id is not null 
	order by existing_node.id
	ON CONFLICT (id) DO NOTHING; 

	------[END] Rebuild Nodes
	
	CREATE TEMP TABLE reconstruct_edge ON COMMIT DROP AS
	SELECT l.edgeid AS id, ST_MakeLine(l.loc ORDER BY ord ASC) AS loc
	FROM replaced_nodes l
	GROUP BY l.edgeid
	HAVING 
    -- Ensure the start and end vertices are not the same
    NOT ST_Equals(ST_StartPoint(ST_MakeLine(l.loc ORDER BY ord ASC)), ST_EndPoint(ST_MakeLine(l.loc ORDER BY ord ASC)))
    -- Ensure the LineString is not degenerate (all points are identical)
    AND NOT ST_Envelope(ST_MakeLine(l.loc ORDER BY ord ASC)) = ST_PointN(ST_MakeLine(l.loc ORDER BY ord ASC), 1);
	
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
 
	CREATE TEMP TABLE temp_conflated_edges ON COMMIT DROP AS
	SELECT 
	w.wid AS id,  
	l.loc as loc,
	--w.conflated_loc AS loc --, 
	l.feature::jsonb,
	ROW_NUMBER() OVER (ORDER BY w.wid) AS id_sequence
	FROM witness w
	LEFT JOIN (
		SELECT DISTINCT ON (id) id, feature, loc 
		FROM temp_repaired_edges
		ORDER BY id  -- Optionally, you can add a secondary ordering criterion
	) l ON w.wid = l.id;

	-- Rebuild node ids
	CREATE TEMP TABLE edges_node_info_temp ON COMMIT DROP AS
    (
		
		SELECT 
		l.id as edgeid, 
		l.loc as loc,
		existing_node.id as new_node_id,
		'orig' AS node_type
		from temp_conflated_edges l
		left join content.node existing_node ON existing_node.node_loc && ST_StartPoint(l.loc) 
		-- AND ST_Equals(existing_node.node_loc, ST_StartPoint(l.loc)) 
		AND ST_SnapToGrid(existing_node.node_loc, 0.00000001) = ST_SnapToGrid(ST_StartPoint(l.loc), 0.00000001)
		AND existing_node.tdei_dataset_id in (SRC_ONE_TDEI_DATASET_ID, SRC_TWO_TDEI_DATASET_ID)
	
	    UNION ALL 

		SELECT 
		l.id as edgeid, 
		l.loc as loc,
		existing_node.id as new_node_id,
		'dest' AS node_type
		from temp_conflated_edges l
		left join content.node existing_node ON existing_node.node_loc && ST_EndPoint(l.loc) 
		-- AND ST_Equals(existing_node.node_loc, ST_EndPoint(l.loc)) 
		AND ST_SnapToGrid(existing_node.node_loc, 0.00000001) = ST_SnapToGrid(ST_EndPoint(l.loc), 0.00000001)
		AND existing_node.tdei_dataset_id in (SRC_ONE_TDEI_DATASET_ID, SRC_TWO_TDEI_DATASET_ID)
	);

 
	CREATE TEMP TABLE edges_node_info_result ON COMMIT DROP AS
	SELECT 
	    edgeid,
		MAX(loc) as loc,
	    MAX(CASE WHEN node_type = 'orig' THEN new_node_id END) AS new_orig_id,
	    MAX(CASE WHEN node_type = 'dest' THEN new_node_id END) AS new_dest_id
	FROM edges_node_info_temp
	GROUP BY edgeid;

	CREATE TEMP TABLE feature_edges ON COMMIT DROP AS
	SELECT DISTINCT ON (id)
	    id AS edge_id,
	    jsonb_build_object(
	        'type', 'Feature',
	        'geometry', ST_AsGeoJSON(e.loc, 15)::json,
	        'properties', 
	        jsonb_build_object(
	            '_id', id_sequence::text,
	            '_u_id', new_orig_id::text, --COALESCE(new_orig_id::text, edgeid || '99'),
	            '_v_id', new_dest_id::text --COALESCE(new_dest_id::text, edgeid || '22')
	        ) || 
			(COALESCE(e.feature::jsonb->'properties', '{}'::jsonb) - '_id' - '_u_id' - '_v_id')
	    ) AS feature,
	    id_sequence AS seq_id
	FROM temp_conflated_edges e
	LEFT JOIN edges_node_info_result en ON e.id = en.edgeid
	ORDER BY id;

	
-- RAISE NOTICE 'Edge processing completed at  % .', clock_timestamp();

-- 	------------------------------ POLYGON -------------------------------------
	-- RAISE NOTICE 'Polygon processing started at  % .', clock_timestamp();

-- Check if there are records in content.zone for the given dataset IDs
    SELECT EXISTS (
        SELECT 1 
        FROM content.zone l
        WHERE l.tdei_dataset_id IN (SRC_ONE_TDEI_DATASET_ID, SRC_TWO_TDEI_DATASET_ID) limit 1
    ) INTO zone_exists;

	 CREATE TEMP TABLE feature_polygons (
        feature json,
        id bigint
    ) ON COMMIT DROP;
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
		LEFT OUTER JOIN temp_node_map p ON l.loc && p.oldloc 
		-- AND ST_Equals(l.loc, p.oldloc)
		AND ST_SnapToGrid(l.loc, 0.00000001) = ST_SnapToGrid(p.oldloc, 0.00000001);
		
		CREATE INDEX idx_replaced_polygon_loc ON replaced_polygon USING GIST(loc);
		CREATE INDEX idx_replaced_polygon_pid ON replaced_polygon(pid);

		--Rebuild nodes
		INSERT INTO new_export_nodes (id, loc, feature)
		SELECT DISTINCT ON (existing_node.id) 
		    existing_node.id AS id, 
		    existing_node.node_loc AS loc, 
			jsonb_build_object(
			'type', 'Feature',
			'geometry', ST_AsGeoJSON(existing_node.node_loc,15)::json,
			 'properties', 
			( jsonb_build_object( '_id', existing_node.id::text ) 
				|| ((existing_node.feature::jsonb->'properties') - '_id') 
			)
		) AS feature
		FROM replaced_polygon l
		LEFT OUTER JOIN content.node existing_node 
		    ON l.loc && existing_node.node_loc 
			-- AND ST_Equals(l.loc, existing_node.node_loc)
		AND ST_SnapToGrid(l.loc, 0.00000001) = ST_SnapToGrid(existing_node.node_loc, 0.00000001)
		AND existing_node.tdei_dataset_id IN (SRC_ONE_TDEI_DATASET_ID)
		WHERE existing_node.id IS NOT NULL
		ORDER BY existing_node.id
		ON CONFLICT (id) DO NOTHING; 

		INSERT INTO new_export_nodes (id, loc, feature)
		SELECT DISTINCT ON (existing_node.id) 
		    existing_node.id AS id, 
		    existing_node.node_loc AS loc, 
			jsonb_build_object(
			'type', 'Feature',
			'geometry', ST_AsGeoJSON(existing_node.node_loc,15)::json,
			 'properties', 
			( jsonb_build_object( '_id', existing_node.id::text ) 
				|| ((existing_node.feature::jsonb->'properties') - '_id') 
			)
		) AS feature
		FROM replaced_polygon l
		LEFT OUTER JOIN content.node existing_node 
		    ON l.loc && existing_node.node_loc 
			-- AND ST_Equals(l.loc, existing_node.node_loc)
			AND ST_SnapToGrid(l.loc, 0.00000001) = ST_SnapToGrid(existing_node.node_loc, 0.00000001)
		AND existing_node.tdei_dataset_id IN (SRC_TWO_TDEI_DATASET_ID)
		WHERE existing_node.id IS NOT NULL
		ORDER BY existing_node.id
		ON CONFLICT (id) DO NOTHING; 
		--Rebuid nodes

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

		CREATE TEMP TABLE witness_poly ON COMMIT DROP AS
		SELECT MIN(aid) AS aid, bid
		FROM joined
		GROUP BY bid;
		
		CREATE INDEX idx_witness_aid ON witness_poly(aid);
		CREATE INDEX idx_witness_bid ON witness_poly(bid);

		CREATE TEMP TABLE conflatedpoly ON COMMIT DROP AS
		SELECT id AS id FROM temp_repaired_polygon  -- all polys
		EXCEPT
		SELECT bid FROM witness_poly; -- those that are mapped to a witness
		
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

		-- Rebuild node ids; Replace node ids with new nodeids set
		CREATE TEMP TABLE polygon_node_info_temp ON COMMIT DROP AS
	    (
			SELECT 
		    cp.id,
		    cp.loc,
		     jsonb_build_object(  -- Rebuild the entire feature
		        'type', 'Feature',  -- Define type as 'Feature'
		        'geometry', ST_AsGeoJSON(cp.loc, 15)::jsonb,  -- Rebuild the geometry with node location
		        'properties', 
				(COALESCE(cp.feature::jsonb->'properties', '{}'::jsonb) - '_w_id' - '_id')

				|| jsonb_build_object('_w_id', 
		            (  -- Replace _w_id with a new array of node ids
		                SELECT jsonb_agg(n.id::text)  -- Aggregate the new node ids
		                FROM jsonb_array_elements_text(cp.feature::jsonb->'properties'->'_w_id') AS w_id
		                LEFT JOIN content.node n
		                    ON w_id::TEXT = n.node_id::TEXT
		                    AND n.tdei_dataset_id IN (SRC_ONE_TDEI_DATASET_ID)
		            )
		        )
				|| jsonb_build_object('_id', cp.id_sequence::text)  -- Add the new _id field
		    ) AS feature
			FROM temp_conflated_polygons cp
			INNER JOIN content.zone z 
			    ON cp.id = z.id 
			WHERE 
			    z.tdei_dataset_id IN (SRC_ONE_TDEI_DATASET_ID)
		
		    UNION ALL
		
		    SELECT 
		    cp.id,
		    cp.loc,
		    jsonb_build_object(  -- Rebuild the entire feature
		        'type', 'Feature',  -- Define type as 'Feature'
		        'geometry', ST_AsGeoJSON(cp.loc, 15)::jsonb,  -- Rebuild the geometry with node location
		        'properties', 
				(COALESCE(cp.feature::jsonb->'properties', '{}'::jsonb) - '_w_id' - '_id')
				|| jsonb_build_object('_w_id', 
		            (  -- Replace _w_id with a new array of node ids
		                SELECT jsonb_agg(n.id::text)  -- Aggregate the new node ids
		                FROM jsonb_array_elements_text(cp.feature::jsonb->'properties'->'_w_id') AS w_id
		                LEFT JOIN content.node n
		                    ON w_id::TEXT = n.node_id::TEXT
		                    AND n.tdei_dataset_id IN (SRC_TWO_TDEI_DATASET_ID)
		            )
		        )
				|| jsonb_build_object('_id', cp.id_sequence::text)  -- Add the new _id field
		    ) AS feature
			FROM temp_conflated_polygons cp
			INNER JOIN content.zone z 
			    ON cp.id = z.id 
			WHERE 
			    z.tdei_dataset_id IN (SRC_TWO_TDEI_DATASET_ID)
		);
	
		-- Rebuild node ids

	     INSERT INTO feature_polygons( feature, id)
	   	 SELECT DISTINCT ON(id) feature,id from polygon_node_info_temp;
   END IF; 
   
    	-- RAISE NOTICE 'Polygon processing completed at  % .', clock_timestamp();

    -- 	------------------------------ Export EDGES -------------------------------------
    SELECT COUNT(*) INTO row_count FROM feature_edges;

    -- Print the row count
    RAISE NOTICE 'The table edges has % rows.', row_count;

	SELECT jsonb_object_agg(key, TRUE)
    INTO edge_mixed_type_keys
    FROM (
		SELECT DISTINCT key
		FROM feature_edges e
		LEFT JOIN LATERAL jsonb_each(COALESCE(e.feature::jsonb->'properties', '{}'::jsonb)) AS prop(key, value)
		ON TRUE
		WHERE key LIKE 'ext:%'
		GROUP BY key
		HAVING COUNT(DISTINCT jsonb_typeof(value)) > 1
    ) subquery;

	UPDATE feature_edges 
    SET feature = jsonb_set(
        feature::jsonb, 
        '{properties}', 
        (
            SELECT jsonb_object_agg(
                key, 
                CASE 
                    -- Convert only keys in edge_mixed_type_keys and that are not already strings
                    WHEN edge_mixed_type_keys ? key AND jsonb_typeof(value) != 'string' 
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
    
 -- Iterate over intersected edges
	fname := 'edge';
    result_cursor := 'edge_cursor';
	OPEN result_cursor FOR         
		SELECT feature
        FROM feature_edges
		WHERE feature is not null
		ORDER by seq_id ASC;
    file_name := fname;
    cursor_ref := result_cursor;
    RETURN NEXT;

	   ------------------------------ Export NODES -------------------------------------

    SELECT COUNT(*) INTO row_count FROM new_export_nodes;

    -- Print the row count
    RAISE NOTICE 'The table nodes has % rows.', row_count;

	SELECT jsonb_object_agg(key, TRUE)
    INTO node_mixed_type_keys
    FROM (
		SELECT DISTINCT key
		FROM new_export_nodes e
		LEFT JOIN LATERAL jsonb_each(COALESCE(e.feature::jsonb->'properties', '{}'::jsonb)) AS prop(key, value)
		ON TRUE
		WHERE key LIKE 'ext:%'
		GROUP BY key
		HAVING COUNT(DISTINCT jsonb_typeof(value)) > 1
    ) subquery;

	UPDATE new_export_nodes 
    SET feature = jsonb_set(
        feature::jsonb, 
        '{properties}', 
        (
            SELECT jsonb_object_agg(
                key, 
                CASE 
                    -- Convert only keys in node_mixed_type_keys and that are not already strings
                    WHEN node_mixed_type_keys ? key AND jsonb_typeof(value) != 'string' 
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
    
     -- Iterate over intersected edges
    fname := 'node';
    result_cursor := 'node_cursor';
	OPEN result_cursor FOR 
        SELECT feature
        FROM new_export_nodes
		WHERE feature is not null
		ORDER by id ASC;
    file_name := fname;
    cursor_ref := result_cursor;
    RETURN NEXT;
    	------------------------------ Export Polygon -------------------------------------
          
    -- IF zone_exists THEN
	SELECT COUNT(*) INTO row_count FROM feature_polygons;

	-- Print the row count
	RAISE NOTICE 'The table polygon has % rows.', row_count;

	SELECT jsonb_object_agg(key, TRUE)
    INTO zone_mixed_type_keys
    FROM (
		SELECT DISTINCT key
		FROM feature_polygons e
		LEFT JOIN LATERAL jsonb_each(COALESCE(e.feature::jsonb->'properties', '{}'::jsonb)) AS prop(key, value)
		ON TRUE
		WHERE key LIKE 'ext:%'
		GROUP BY key
		HAVING COUNT(DISTINCT jsonb_typeof(value)) > 1
    ) subquery;

	UPDATE feature_polygons 
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

	fname := 'polygon';
    result_cursor := 'polygon_cursor';
	OPEN result_cursor FOR 		
		SELECT feature
		FROM feature_polygons
		WHERE feature is not null
		ORDER by id ASC;
	file_name := fname;
    cursor_ref := result_cursor;
    RETURN NEXT;

 -- Drop the temporary table
    -- DROP TABLE IF EXISTS feature_polygons;
RETURN;
END;
$BODY$;