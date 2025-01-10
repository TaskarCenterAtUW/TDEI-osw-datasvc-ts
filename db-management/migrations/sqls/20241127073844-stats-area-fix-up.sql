CREATE OR REPLACE FUNCTION content.tdei_update_osw_stats(
	p_tdei_dataset_id character varying)
    RETURNS void
    LANGUAGE 'plpgsql'
    COST 100
    VOLATILE PARALLEL UNSAFE
AS $BODY$
DECLARE
 area_km2_val REAL;
BEGIN
	WITH
	osw_dataset_edges_cte AS (
            SELECT 
            count(*) as num_edges,
            SUM(CASE WHEN footway = 'sidewalk' THEN 1 ELSE 0 END) AS num_sidewalks,
            SUM(CASE WHEN footway = 'sidewalk' THEN length ELSE 0 END) AS length_of_sidewalks_mtr,
            SUM(CASE WHEN footway = 'crossing' THEN 1 ELSE 0 END) AS num_crossings
            FROM content.edge WHERE tdei_dataset_id = p_tdei_dataset_id
        ),
         osw_dataset_nodes_cte AS (
            SELECT COUNT(*) as num_nodes,
            SUM(CASE WHEN barrier = 'kerb' THEN 1 ELSE 0 END) AS num_kerbs
            FROM content.node WHERE tdei_dataset_id = p_tdei_dataset_id
        )
	    INSERT INTO content.osw_stats (tdei_dataset_id, num_crossings, length_of_sidewalks_mtr, num_edges, num_nodes, num_kerbs)
		SELECT p_tdei_dataset_id, num_crossings, length_of_sidewalks_mtr, num_edges, num_nodes, num_kerbs
		FROM osw_dataset_edges_cte, osw_dataset_nodes_cte
		ON CONFLICT (tdei_dataset_id)
		DO UPDATE
		SET num_crossings = EXCLUDED.num_crossings,
			length_of_sidewalks_mtr = EXCLUDED.length_of_sidewalks_mtr,
			num_edges = EXCLUDED.num_edges,
			num_nodes = EXCLUDED.num_nodes,
			num_kerbs = EXCLUDED.num_kerbs;
	
	WITH
	EXTENT AS ( -- overall boundingbox
		SELECT ST_EXTENT (EDGE_LOC_3857) AS EXT
		FROM CONTENT.EDGE
		WHERE TDEI_DATASET_ID = p_tdei_dataset_id
	),
	WIDTH AS ( -- cell size
		SELECT (ST_XMAX (EXT) - ST_XMIN (EXT)) / 5.0 AS SIZE -- 1/5th of the overall extent, can modify
			, EXT
		FROM EXTENT
	),
	GRID AS ( -- grid cells
		SELECT ST_SETSRID (G.GEOM, 3857) GEOM
		FROM WIDTH W, ST_SQUAREGRID (W.SIZE, W.EXT) G
	),
	GRIDUNIONS AS ( -- union of elements within each grid cell
		SELECT G.GEOM,
			ST_AREA (ST_INTERSECTION( ST_UNARYUNION (
				ST_COLLECT (
					ST_BUFFER (
						E.EDGE_LOC_3857,
						8,
						'endcap=square join=mitre mitre_limit=1.0'
						)
					)
				), G.GEOM)
			) AS CELLAREA
		FROM CONTENT.EDGE E, GRID G
		WHERE E.TDEI_DATASET_ID = p_tdei_dataset_id -- Filter at this stage
			AND ST_INTERSECTS (E.EDGE_LOC_3857, G.GEOM)
		GROUP BY G.GEOM
	) 
		SELECT SUM (CELLAREA) / 1000000 AS KM2
		INTO area_km2_val
		FROM GRIDUNIONS;
		
    UPDATE content.osw_stats
    SET 
	area_km2 = area_km2_val
    WHERE tdei_dataset_id = p_tdei_dataset_id;

    RAISE NOTICE 'OSW stats updated successfully for dataset id: %', p_tdei_dataset_id;
END;
$BODY$;