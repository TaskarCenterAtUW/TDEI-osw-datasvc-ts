ALTER TABLE IF EXISTS public.osw_formatting_jobs
    DROP COLUMN IF EXISTS updated_at;

ALTER TABLE IF EXISTS public.osw_formatting_jobs
    DROP COLUMN IF EXISTS requested_by;

ALTER TABLE IF EXISTS public.osw_validation_jobs
    DROP COLUMN IF EXISTS requested_by;

ALTER TABLE IF EXISTS public.osw_versions
    DROP COLUMN IF EXISTS update_at;

ALTER TABLE IF EXISTS public.osw_versions
    DROP COLUMN IF EXISTS updated_by;