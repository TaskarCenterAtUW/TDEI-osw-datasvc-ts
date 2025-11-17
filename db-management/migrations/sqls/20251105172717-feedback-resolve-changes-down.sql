ALTER TABLE IF EXISTS content.feedback
    DROP COLUMN IF EXISTS resolved_by;

ALTER TABLE IF EXISTS content.feedback
    DROP COLUMN IF EXISTS resolution_status;

ALTER TABLE IF EXISTS content.feedback
    DROP COLUMN IF EXISTS resolution_description;
