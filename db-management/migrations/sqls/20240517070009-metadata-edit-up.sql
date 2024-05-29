-- Function
CREATE OR REPLACE FUNCTION content.tdei_json_read_date(json_data json, key_name text) RETURNS timestamp without time zone AS $$
BEGIN
    IF json_data ->> key_name IS NOT NULL THEN
        RETURN (json_data ->> key_name)::timestamp without time zone;
    ELSE
        RETURN CURRENT_TIMESTAMP;
    END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

--Add metadata column to dataset table
ALTER TABLE content.dataset ADD COLUMN metadata_json json;
-- Update metadata column with metadata from metadata table
UPDATE content.dataset d 
SET metadata_json = jsonb_build_object(
   'full_dataset_name', name,
    'other_published_locations', null,
    'dataset_update_frequency_months', null,
    'schema_validation_run', null,
    'schema_validation_run_description', null,
    'allow_crowd_contributions', null,
    'location_inaccuracy_factors', null,
	'name', name,
    'description', description,
    'version', version,
    'custom_metadata', custom_metadata,
    'collected_by', collected_by,
    'collection_date', collection_date,
    'valid_from', valid_from,
    'valid_to', valid_to,
    'collection_method', collection_method,
    'data_source', data_source,
    'dataset_area', ST_AsGeoJSON(dataset_area),
    'schema_version', schema_version,
    'collection_name', null,
    'department_name', null,
    'city', null,
    'region', null,
    'county', null,
    'key_limitations_of_the_dataset', null,
    'challenges', null,
    'official_maintainer', null,
    'last_updated', null,
    'update_frequency', null,
    'authorization_chain', null,
    'maintenance_funded', null,
    'funding_details', null,
    'point_data_collection_device', null,
    'node_locations_and_attributes_editing_software', null,
    'data_collected_by_people', null,
    'data_collectors', null,
    'data_captured_automatically', null,
    'automated_collection', null,
    'data_collectors_organization', null,
    'data_collector_compensation', null,
    'preprocessing_location', null,
    'preprocessing_by', null,
    'preprocessing_steps', null,
    'data_collection_preprocessing_documentation', null,
    'documentation_uri', null,
    'validation_process_exists', null,
    'validation_process_description', null,
    'validation_conducted_by', null,
    'excluded_data', null,
    'excluded_data_reason', null
)
FROM content.metadata m
WHERE d.tdei_dataset_id = m.tdei_dataset_id;


-- Add generated column to dataset table 
ALTER TABLE content.dataset ADD COLUMN name character varying(500) GENERATED ALWAYS AS (((metadata_json ->> 'name'::text))) STORED;
ALTER TABLE content.dataset ADD COLUMN version character varying(20) GENERATED ALWAYS AS (((metadata_json ->> 'version'::text))) STORED;
ALTER TABLE content.dataset 
ADD COLUMN dataset_area geometry(Polygon, 4326) 
GENERATED ALWAYS AS (
    CASE 
        WHEN (metadata_json -> 'dataset_area' -> 'features') IS NULL OR json_array_length(metadata_json -> 'dataset_area' -> 'features') = 0 
        THEN NULL
        ELSE ST_GeomFromGeoJSON((metadata_json->'dataset_area' #>> '{features,0,geometry}'))
    END
) STORED;

ALTER TABLE content.dataset ADD COLUMN valid_from timestamp without time zone GENERATED ALWAYS AS (content.tdei_json_read_date(metadata_json, 'valid_from')) STORED;
ALTER TABLE content.dataset ADD COLUMN valid_to timestamp without time zone GENERATED ALWAYS AS (content.tdei_json_read_date(metadata_json, 'valid_to')) STORED;
ALTER TABLE content.dataset ADD COLUMN collection_date timestamp without time zone GENERATED ALWAYS AS (content.tdei_json_read_date(metadata_json, 'collection_date')) STORED;


--Add unique contraint on name and version
ALTER TABLE content.dataset
ADD CONSTRAINT dataset_name_version_unique
EXCLUDE USING btree (name WITH =, version WITH =)
WHERE (status != 'DELETED');

