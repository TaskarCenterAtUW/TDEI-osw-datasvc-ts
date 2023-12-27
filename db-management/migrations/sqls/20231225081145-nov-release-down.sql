-- down.sql
ALTER TABLE public.osw_versions
    ALTER COLUMN confidence_level TYPE integer;
-- Revert changes: Add NOT NULL constraint to publication_date
ALTER TABLE IF EXISTS public.osw_versions
    ALTER COLUMN publication_date SET NOT NULL;

-- Revert changes: Remove new columns
ALTER TABLE IF EXISTS public.osw_versions
    DROP COLUMN IF EXISTS cm_version,
    DROP COLUMN IF EXISTS cm_last_calculated_at,
    DROP COLUMN IF EXISTS download_osm_url;
