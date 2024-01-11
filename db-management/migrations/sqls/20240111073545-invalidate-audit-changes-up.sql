ALTER TABLE IF EXISTS public.osw_formatting_jobs
    ADD COLUMN updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE IF EXISTS public.osw_formatting_jobs
    ADD COLUMN requested_by character varying;

ALTER TABLE IF EXISTS public.osw_validation_jobs
    ADD COLUMN requested_by character varying;

ALTER TABLE IF EXISTS public.osw_versions
    ADD COLUMN updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE IF EXISTS public.osw_versions
    ADD COLUMN updated_by character varying;


    