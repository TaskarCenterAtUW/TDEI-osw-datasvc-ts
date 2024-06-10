-- Drop the unique constraint on name and version
ALTER TABLE content.dataset DROP CONSTRAINT IF EXISTS dataset_name_version_unique;

-- Drop generated columns
ALTER TABLE content.dataset DROP COLUMN IF EXISTS collection_date;
ALTER TABLE content.dataset DROP COLUMN IF EXISTS valid_to;
ALTER TABLE content.dataset DROP COLUMN IF EXISTS valid_from;
ALTER TABLE content.dataset DROP COLUMN IF EXISTS dataset_area;
ALTER TABLE content.dataset DROP COLUMN IF EXISTS version;
ALTER TABLE content.dataset DROP COLUMN IF EXISTS name;

-- Set metadata column to nullable
ALTER TABLE content.dataset ALTER COLUMN metadata_json DROP NOT NULL;

-- Remove the metadata column from the dataset table
ALTER TABLE content.dataset DROP COLUMN IF EXISTS metadata_json;

-- Drop the function
DROP FUNCTION IF EXISTS content.tdei_json_read_date(json, text);
