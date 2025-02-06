ALTER TABLE content.extension_point
ADD COLUMN IF NOT EXISTS point_loc_3857 geometry(Geometry, 3857) 
    GENERATED ALWAYS AS (
        ST_Transform(
            ST_GeomFromGeoJSON(feature ->> 'geometry'),
            3857
        )
    ) STORED;
	
CREATE INDEX IF NOT EXISTS idx_point_loc_3857_gist ON content.extension_point USING GIST (point_loc_3857);


ALTER TABLE content.extension_line
ADD COLUMN IF NOT EXISTS line_loc_3857 geometry(Geometry, 3857) 
    GENERATED ALWAYS AS (
        ST_Transform(
            ST_GeomFromGeoJSON(feature ->> 'geometry'),
            3857
        )
    ) STORED;
	
CREATE INDEX IF NOT EXISTS idx_line_loc_3857_gist ON content.extension_line USING GIST (line_loc_3857);

-- ALTER TABLE content.extension_polygon
-- ADD COLUMN IF NOT EXISTS polygon_loc_3857 geometry(Geometry, 3857) 
--     GENERATED ALWAYS AS (
--         ST_Transform(
--             ST_GeomFromGeoJSON(feature ->> 'geometry'),
--             3857
--         )
--     ) STORED;
	
-- CREATE INDEX IF NOT EXISTS idx_polygon_loc_3857_gist ON content.extension_polygon USING GIST (polygon_loc_3857);


CREATE OR REPLACE FUNCTION content.tdei_clone_osw_dataset_elements(
	clone_tdei_dataset_id text,
	target_tdei_dataset_id text,
	user_id text)
    RETURNS void
    LANGUAGE 'plpgsql'
    COST 100
    VOLATILE PARALLEL UNSAFE
AS $BODY$
BEGIN
    BEGIN
        -- Clone edge
        INSERT INTO content.edge (
            tdei_dataset_id, feature, created_at, requested_by, updated_at, updated_by
        )
        SELECT 
            target_tdei_dataset_id, -- New tdei_dataset_id
            feature,
            CURRENT_TIMESTAMP, -- created_at
            user_id, -- requested_by
            CURRENT_TIMESTAMP, -- updated_at
            user_id -- updated_by
        FROM content.edge
        WHERE tdei_dataset_id = clone_tdei_dataset_id;

        -- Clone node
        INSERT INTO content.node (
            tdei_dataset_id, feature, created_at, requested_by, updated_at, updated_by
        )
        SELECT 
            target_tdei_dataset_id, -- New tdei_dataset_id
            feature,
            CURRENT_TIMESTAMP, -- created_at
            user_id, -- requested_by
            CURRENT_TIMESTAMP, -- updated_at
            user_id -- updated_by
        FROM content.node
        WHERE tdei_dataset_id = clone_tdei_dataset_id;

        -- Clone zone
        INSERT INTO content.zone (
            tdei_dataset_id, feature, created_at, requested_by, updated_at, updated_by
        )
        SELECT 
            target_tdei_dataset_id, -- New tdei_dataset_id
            feature,
            CURRENT_TIMESTAMP, -- created_at
            user_id, -- requested_by
            CURRENT_TIMESTAMP, -- updated_at
            user_id -- updated_by
        FROM content.zone
        WHERE tdei_dataset_id = clone_tdei_dataset_id;

        -- Clone extension_line
        INSERT INTO content.extension_line (
            tdei_dataset_id, feature, created_at, requested_by, updated_at, updated_by
        )
        SELECT 
            target_tdei_dataset_id, -- New tdei_dataset_id
            feature,
            CURRENT_TIMESTAMP, -- created_at
            user_id, -- requested_by
            CURRENT_TIMESTAMP, -- updated_at
            user_id -- updated_by
        FROM content.extension_line
        WHERE tdei_dataset_id = clone_tdei_dataset_id;

        -- Clone extension_point
        INSERT INTO content.extension_point (
            tdei_dataset_id, feature, created_at, requested_by, updated_at, updated_by
        )
        SELECT 
            target_tdei_dataset_id, -- New tdei_dataset_id
            feature,
            CURRENT_TIMESTAMP, -- created_at
            user_id, -- requested_by
            CURRENT_TIMESTAMP, -- updated_at
            user_id -- updated_by
        FROM content.extension_point
        WHERE tdei_dataset_id = clone_tdei_dataset_id;

        -- Clone extension_polygon
        INSERT INTO content.extension_polygon (
            tdei_dataset_id, feature, created_at, requested_by, updated_at, updated_by
        )
        SELECT 
            target_tdei_dataset_id, -- New tdei_dataset_id
            feature,
            CURRENT_TIMESTAMP, -- created_at
            user_id, -- requested_by
            CURRENT_TIMESTAMP, -- updated_at
            user_id -- updated_by
        FROM content.extension_polygon
        WHERE tdei_dataset_id = clone_tdei_dataset_id;

		-- Clone extension_file and get the new ext_file_ids
		WITH inserted_files AS (
		    INSERT INTO content.extension_file (
		        tdei_dataset_id, name, file_meta, created_at, requested_by
		    )
		    SELECT 
		        target_tdei_dataset_id,  -- New tdei_dataset_id
		        name,
		        file_meta,
		        CURRENT_TIMESTAMP,  -- created_at
		        user_id  -- requested_by
		    FROM content.extension_file
		    WHERE tdei_dataset_id = clone_tdei_dataset_id
		    RETURNING id AS new_ext_file_id, name, tdei_dataset_id  -- Returning the new ID and name
		),
		-- Map old ext_file_id to new ext_file_id
		mapped_tables AS (
		    SELECT 
		        org.id AS org_ext_file_id, 
		        new.new_ext_file_id
		    FROM content.extension_file org
		    INNER JOIN inserted_files new ON org.name = new.name
			Where org.tdei_dataset_id = clone_tdei_dataset_id
		)
		
		-- Clone extension and link new ext_file_id
		INSERT INTO content.extension (
		    tdei_dataset_id, feature, ext_file_id, created_at, requested_by
		)
		SELECT 
		    target_tdei_dataset_id,  -- New tdei_dataset_id
		    feature,
		    -- Map old ext_file_id to new ext_file_id
		    mapped_tables.new_ext_file_id AS ext_file_id,
		    CURRENT_TIMESTAMP,  -- created_at
		    user_id  -- requested_by
		FROM content.extension e
		LEFT JOIN mapped_tables
		    ON e.ext_file_id = mapped_tables.org_ext_file_id  -- Match old ext_file_id to new
		WHERE e.tdei_dataset_id = clone_tdei_dataset_id;

    EXCEPTION
        WHEN OTHERS THEN
            -- Rollback transaction in case of any error
            RAISE EXCEPTION 'Error cloning dataset elements: %', SQLERRM;
    END;
END;
$BODY$;