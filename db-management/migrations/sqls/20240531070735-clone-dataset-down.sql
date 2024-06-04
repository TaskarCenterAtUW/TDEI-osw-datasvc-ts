-- Rollback script to remove added columns

ALTER TABLE IF EXISTS content.edge
    DROP COLUMN IF EXISTS updated_at;

ALTER TABLE IF EXISTS content.edge
    DROP COLUMN IF EXISTS updated_by;

ALTER TABLE IF EXISTS content.node
    DROP COLUMN IF EXISTS updated_at;

ALTER TABLE IF EXISTS content.node
    DROP COLUMN IF EXISTS updated_by;

ALTER TABLE IF EXISTS content.zone
    DROP COLUMN IF EXISTS updated_at;

ALTER TABLE IF EXISTS content.zone
    DROP COLUMN IF EXISTS updated_by;

ALTER TABLE IF EXISTS content.extension_line
    DROP COLUMN IF EXISTS updated_at;

ALTER TABLE IF EXISTS content.extension_line
    DROP COLUMN IF EXISTS updated_by;

ALTER TABLE IF EXISTS content.extension_point
    DROP COLUMN IF EXISTS updated_at;

ALTER TABLE IF EXISTS content.extension_point
    DROP COLUMN IF EXISTS updated_by;

ALTER TABLE IF EXISTS content.extension_polygon
    DROP COLUMN IF EXISTS updated_at;

ALTER TABLE IF EXISTS content.extension_polygon
    DROP COLUMN IF EXISTS updated_by;


DROP FUNCTION IF EXISTS content.tdei_delete_osw_dataset_elements(text);

DROP FUNCTION IF EXISTS content.tdei_clone_osw_dataset_elements(text, text, text);

DROP FUNCTION IF EXISTS content.tdei_clone_dataset(text, text, text, json, text);
 
