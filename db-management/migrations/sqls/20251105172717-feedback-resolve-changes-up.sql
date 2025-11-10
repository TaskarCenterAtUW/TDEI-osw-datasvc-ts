ALTER TABLE IF EXISTS content.feedback
    ADD COLUMN IF NOT EXISTS  resolved_by character varying(40);

ALTER TABLE IF EXISTS content.feedback
    ADD COLUMN IF NOT EXISTS  resolution_status character varying(100);

ALTER TABLE IF EXISTS content.feedback
    ADD COLUMN IF NOT EXISTS  resolution_description character varying(5000);