-- This is the reverse of the up script.
-- Drop the new columns and revert the alterations made in the up script.

-- Alter scripts
ALTER TABLE IF EXISTS public.osw_versions ADD COLUMN IF NOT EXISTS file_upload_path character varying COLLATE pg_catalog."default";

ALTER TABLE IF EXISTS public.osw_versions ADD COLUMN IF NOT EXISTS collected_by character varying COLLATE pg_catalog."default";

ALTER TABLE IF EXISTS public.osw_versions ADD COLUMN IF NOT EXISTS collection_date timestamp without time zone;

ALTER TABLE IF EXISTS public.osw_versions ADD COLUMN IF NOT EXISTS collection_method character varying COLLATE pg_catalog."default";

ALTER TABLE IF EXISTS public.osw_versions ADD COLUMN IF NOT EXISTS publication_date timestamp without time zone;

ALTER TABLE IF EXISTS public.osw_versions ADD COLUMN IF NOT EXISTS data_source character varying COLLATE pg_catalog."default";

ALTER TABLE IF EXISTS public.osw_versions ADD COLUMN IF NOT EXISTS osw_schema_version character varying COLLATE pg_catalog."default";

ALTER TABLE IF EXISTS public.osw_versions ADD COLUMN IF NOT EXISTS uploaded_date timestamp without time zone;

ALTER TABLE IF EXISTS public.osw_versions ALTER COLUMN IF EXISTS tdei_project_group_id SET NOT NULL;

-- Drop
ALTER TABLE IF EXISTS public.osw_versions DROP COLUMN IF EXISTS download_osw_url;

ALTER TABLE IF EXISTS public.osw_versions DROP COLUMN IF EXISTS uploaded_timestamp;

ALTER TABLE IF EXISTS public.osw_versions DROP COLUMN IF EXISTS derived_from_dataset_id;

ALTER TABLE IF EXISTS public.osw_versions DROP COLUMN IF EXISTS status;

ALTER TABLE IF EXISTS public.osw_versions DROP COLUMN IF EXISTS tdei_service_id;

ALTER TABLE IF EXISTS public.osw_versions DROP COLUMN IF EXISTS download_changeset_url;

ALTER TABLE IF EXISTS public.osw_versions DROP COLUMN IF EXISTS download_metadata_url;

-- Create index
CREATE INDEX IF NOT EXISTS polygon_geom_idx
    ON public.osw_versions USING gist
    (polygon)

-- Drop tables
DROP TABLE IF EXISTS public.osw_metadata;

DROP TABLE IF EXISTS public.osw_validation_jobs;

DROP TABLE IF EXISTS public.osw_workflow_history;
