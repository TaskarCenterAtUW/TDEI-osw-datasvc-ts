ALTER TABLE content.dataset
ADD COLUMN IF NOT EXISTS "upload_file_size_bytes" BIGINT DEFAULT NULL;

CREATE TABLE IF NOT EXISTS content.osw_stats
(
    tdei_dataset_id character varying(40) COLLATE pg_catalog."default" NOT NULL,
    num_crossings bigint,
    length_of_sidewalks_mtr real,
    num_edges bigint,
    num_nodes bigint,
    area_union geometry,
    area_km2 double precision,
    num_kerbs bigint,
    CONSTRAINT osw_stats_pkey PRIMARY KEY (tdei_dataset_id)
)

CREATE OR REPLACE FUNCTION content.tdei_update_osw_stats(p_tdei_dataset_id character varying)
RETURNS void
LANGUAGE plpgsql
AS
$$
DECLARE
    batch_size INT := 1000;
    total_batches INT;
    final_area REAL := 0;
	final_union geometry;
    union_set geometry;
    batch_number INT := 0;
BEGIN
    final_union := null;
    
	total_batches := GREATEST(CEIL((SELECT COUNT(*) FROM content.node WHERE tdei_dataset_id = p_tdei_dataset_id) / batch_size), 1); 
	
	WITH
	osw_dataset_edges_cte AS (
            SELECT 
            count(*) as num_edges,
            COUNT(CASE WHEN footway = 'sidewalk' THEN 1 ELSE 0 END) AS num_sidewalks,
            SUM(CASE WHEN footway = 'sidewalk' THEN length ELSE 0 END) AS length_of_sidewalks_mtr,
            COUNT(CASE WHEN footway = 'crossing' THEN 1 ELSE 0 END) AS num_crossings
            FROM content.edge WHERE tdei_dataset_id = p_tdei_dataset_id
        ),
         osw_dataset_nodes_cte AS (
            SELECT COUNT(*) as num_nodes,
            COUNT(CASE WHEN barrier = 'kerb' THEN 1 ELSE 0 END) AS num_kerbs
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
	
    WHILE batch_number < total_batches LOOP
        SELECT ST_Union(ST_Transform(ST_Buffer(ST_Transform(edge_loc, 3857), 2), 4326))
        INTO union_set
        FROM (
            SELECT edge_loc
            FROM content.edge
            WHERE tdei_dataset_id = p_tdei_dataset_id AND ST_IsValid(edge_loc) AND ST_Envelope(edge_loc) && ST_MakeEnvelope(-180, -90, 180, 90, 4326)
            ORDER BY id
            LIMIT batch_size OFFSET batch_number * batch_size
        ) AS batch_edges;

        IF union_set IS NOT NULL THEN
            IF final_union IS NULL THEN
                final_union := ST_Transform(union_set, 3857);
            ELSE
				final_union := ST_Union(final_union, ST_Transform(union_set, 3857));                 
			END IF;
        END IF;

        batch_number := batch_number + 1;
    END LOOP;

    UPDATE content.osw_stats
    SET 
	area_union = final_union,
	area_km2 = ST_Area(final_union)/1000000 -- km2
    WHERE tdei_dataset_id = p_tdei_dataset_id;

    RAISE NOTICE 'OSW stats updated successfully for dataset id: %', p_tdei_dataset_id;
END;
$$;


CREATE OR REPLACE FUNCTION content.tdei_fetch_data_metrics()
RETURNS JSON AS $$
DECLARE
    result JSON;
BEGIN
    WITH
         dataset_stat_cte AS (
            SELECT 
            COUNT(tdei_dataset_id) as totaluploads,
            SUM(upload_file_size_bytes) AS totalSizeByt
            FROM content.dataset WHERE status not in ('Deleted', 'Draft')
        ),
        osw_dataset_edges_cte AS (
            SELECT 
            SUM(num_edges) as num_edges,
            ROUND(CAST((SUM(length_of_sidewalks_mtr)/1000) AS numeric),2) as length_of_sidewalks_km,
            SUM(num_crossings) AS num_crossings,
            SUM(num_nodes) as num_nodes,
            SUM(area_km2) as area_km2
            FROM content.osw_stats os
            INNER JOIN content.dataset ds ON os.tdei_dataset_id = ds.tdei_dataset_id
            WHERE ds.status not in ('Deleted', 'Draft')
        ),
        datset_metric_cte AS (
            SELECT 
            COUNT(CASE WHEN data_type = 'osw' THEN 1 ELSE 0 END) AS osw_totalDatasets,
            COUNT(CASE WHEN data_type = 'flex' THEN 1 ELSE 0 END) AS flex_totalDatasets,
            COUNT(CASE WHEN data_type = 'pathways' THEN 1 ELSE 0 END) AS pathways_totalDatasets,
            SUM(CASE WHEN data_type = 'osw' THEN upload_file_size_bytes ELSE 0 END) AS osw_totalSizeByt,
            SUM(CASE WHEN data_type = 'flex' THEN upload_file_size_bytes ELSE 0 END) AS flex_totalSizeByt,
            SUM(CASE WHEN data_type = 'pathways' THEN upload_file_size_bytes ELSE 0 END) AS pathways_totalSizeByt
            FROM content.dataset  
            WHERE status not in ('Deleted', 'Draft')
        )
     
    SELECT json_build_object(
        'dataMetrics', json_build_object(
            'datasetByType' , json_build_object(
             'osw', json_build_object(
                'totalDatasets', dmc.osw_totalDatasets,
                'totalSizeMB', ROUND(dmc.osw_totalSizeByt / 1048576.0, 2),
                 'aggregatedStats', json_build_object(
                    'num_crossings', odec.num_crossings,
                    'length_of_sidewalks_km', odec.length_of_sidewalks_km,
                    'num_edges', odec.num_edges,
                    'num_nodes', odec.num_nodes,
                    'area_km2', ROUND(CAST(odec.area_km2 as DECIMAL),2)
                )
            ),
            'flex', json_build_object(
                'totalDatasets', dmc.flex_totalDatasets,
                'totalSizeMB', ROUND(dmc.flex_totalSizeByt / 1048576.0, 2)
            ),
             'pathways', json_build_object(
                'totalDatasets', dmc.pathways_totalDatasets,
                'totalSizeMB', ROUND(dmc.pathways_totalSizeByt / 1048576.0, 2)
            )
          )
        ),
        'datasetMetrics', json_build_object(
             'totalUploads', json_build_object(
                'count', dsc.totaluploads,
                'totalSizeMB', ROUND(dsc.totalSizeByt / 1048576.0, 2)
            )
        )
    ) INTO result
    FROM osw_dataset_edges_cte odec
    CROSS JOIN datset_metric_cte dmc
    CROSS JOIN dataset_stat_cte dsc;

    RETURN result;
END;
$$ LANGUAGE plpgsql;



