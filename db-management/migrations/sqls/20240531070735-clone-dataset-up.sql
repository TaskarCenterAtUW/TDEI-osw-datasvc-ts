ALTER TABLE IF EXISTS content.edge
    ADD COLUMN updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE IF EXISTS content.edge
    ADD COLUMN updated_by character varying(40);

ALTER TABLE IF EXISTS content.node
    ADD COLUMN updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE IF EXISTS content.node
    ADD COLUMN updated_by character varying(40);


ALTER TABLE IF EXISTS content.zone
    ADD COLUMN updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE IF EXISTS content.zone
    ADD COLUMN updated_by character varying(40);

ALTER TABLE IF EXISTS content.extension_line
    ADD COLUMN updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE IF EXISTS content.extension_line
    ADD COLUMN updated_by character varying(40);

ALTER TABLE IF EXISTS content.extension_point
    ADD COLUMN updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE IF EXISTS content.extension_point
    ADD COLUMN updated_by character varying(40);

ALTER TABLE IF EXISTS content.extension_polygon
    ADD COLUMN updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE IF EXISTS content.extension_polygon
    ADD COLUMN updated_by character varying(40);

CREATE OR REPLACE FUNCTION content.tdei_clone_dataset(
    clone_tdei_dataset_id text,
    to_tdei_project_group_id text,
    to_tdei_service_id text,
	new_metadata_json json,
	user_id text
)
RETURNS text AS $$
DECLARE
    new_tdei_dataset_id text;
BEGIN
	--Clone dataset
    INSERT INTO content.dataset (
        data_type,tdei_project_group_id,tdei_service_id,derived_from_dataset_id,
        dataset_url,metadata_url,changeset_url,osm_url,status,confidence_level,
        cm_version,cm_last_calculated_at,uploaded_timestamp,updated_at,updated_by,
        uploaded_by,event_info,node_info,ext_point_info,ext_line_info,ext_polygon_info,
        latest_dataset_url,latest_osm_url,zone_info,metadata_json
    )
    SELECT 
        data_type,
        tdei_project_group_id = to_tdei_project_group_id, -- New tdei_project_group_id
        tdei_service_id = to_tdei_service_id, -- New tdei_service_id
        derived_from_dataset_id = clone_tdei_dataset_id, -- derived_from_dataset_id is set to the original dataset ID
        dataset_url,metadata_url,changeset_url,osm_url,'Draft' as status,confidence_level,
        cm_version,cm_last_calculated_at,
		CURRENT_TIMESTAMP, --uploaded_timestamp
		CURRENT_TIMESTAMP, --updated_at
        user_id, -- updated_by
		user_id, -- uploaded_by
        event_info,node_info,ext_point_info,ext_line_info,ext_polygon_info,
        latest_dataset_url,latest_osm_url,zone_info,
        new_metadata_json::json -- new metadata json
    FROM content.dataset
    WHERE tdei_dataset_id = clone_tdei_dataset_id
    RETURNING tdei_dataset_id INTO new_tdei_dataset_id;
	
    RETURN new_tdei_dataset_id;
END;
$$ LANGUAGE plpgsql;


CREATE OR REPLACE FUNCTION content.tdei_clone_osw_dataset_elements(
    clone_tdei_dataset_id text,
    target_tdei_dataset_id text,
    user_id text
)
RETURNS void AS $$
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

    EXCEPTION
        WHEN OTHERS THEN
            -- Rollback transaction in case of any error
            RAISE EXCEPTION 'Error cloning dataset elements: %', SQLERRM;
    END;
END;
$$ LANGUAGE plpgsql;
-- Rollback script to drop the function



CREATE OR REPLACE FUNCTION content.tdei_delete_osw_dataset_elements(
    delete_tdei_dataset_id text
)
RETURNS void AS $$
BEGIN
    BEGIN
        -- Delete edge
        DELETE FROM content.edge
        WHERE tdei_dataset_id = delete_tdei_dataset_id;

        -- Delete node
        DELETE FROM content.node
        WHERE tdei_dataset_id = delete_tdei_dataset_id;

        -- Delete zone
        DELETE FROM content.zone
        WHERE tdei_dataset_id = delete_tdei_dataset_id;

        -- Delete extension_line
        DELETE FROM content.extension_line
        WHERE tdei_dataset_id = delete_tdei_dataset_id;

        -- Delete extension_point
        DELETE FROM content.extension_point
        WHERE tdei_dataset_id = delete_tdei_dataset_id;

        -- Delete extension_polygon
        DELETE FROM content.extension_polygon
        WHERE tdei_dataset_id = delete_tdei_dataset_id;

    EXCEPTION
        WHEN OTHERS THEN
            -- Rollback transaction in case of any error
            RAISE EXCEPTION 'Error deleting dataset elements: %', SQLERRM;
    END;
END;
$$ LANGUAGE plpgsql;

