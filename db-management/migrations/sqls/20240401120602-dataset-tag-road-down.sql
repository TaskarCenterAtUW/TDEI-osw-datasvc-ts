DROP FUNCTION IF EXISTS content.dataset_tag_road(character varying, character varying);
DROP FUNCTION IF EXISTS content.extract_dataset(character varying);
ALTER TABLE content.dataset DROP COLUMN IF EXISTS latest_dataset_url;
ALTER TABLE content.dataset DROP COLUMN IF EXISTS latest_osm_url;