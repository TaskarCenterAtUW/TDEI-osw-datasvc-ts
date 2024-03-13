-- Drop the function if it exists
DROP FUNCTION IF EXISTS content.bbox_intersect(character varying, DECIMAL, DECIMAL, DECIMAL, DECIMAL);

-- Drop the type if it exists
DROP TYPE IF EXISTS content.osw_dataset;