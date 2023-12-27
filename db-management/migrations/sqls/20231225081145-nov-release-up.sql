----- Alter scripts
ALTER TABLE public.osw_versions
    ALTER COLUMN confidence_level TYPE real;

ALTER TABLE IF EXISTS public.osw_versions
    ALTER COLUMN publication_date DROP NOT NULL;

ALTER TABLE IF EXISTS public.osw_versions
    ADD COLUMN cm_version character varying COLLATE pg_catalog."default";

ALTER TABLE IF EXISTS public.osw_versions
    ADD COLUMN cm_last_calculated_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE IF EXISTS public.osw_versions
    ADD COLUMN download_osm_url character varying COLLATE pg_catalog."default";

---- Create scripts
CREATE TABLE IF NOT EXISTS public.osw_confidence_jobs
(
    jobid bigint NOT NULL GENERATED ALWAYS AS IDENTITY ( INCREMENT 1 START 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 ),
    tdei_record_id character varying COLLATE pg_catalog."default" NOT NULL,
    confidence_metric real DEFAULT 0,
    trigger_type character varying COLLATE pg_catalog."default" NOT NULL,
    created_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    status character varying COLLATE pg_catalog."default" NOT NULL,
    user_id character varying COLLATE pg_catalog."default",
    cm_version character varying COLLATE pg_catalog."default",
    cm_last_calculated_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PK_confidence_job_id" PRIMARY KEY (jobid)
)

TABLESPACE pg_default;

CREATE TABLE IF NOT EXISTS public.osw_formatting_jobs
(
    jobid bigint NOT NULL GENERATED ALWAYS AS IDENTITY ( INCREMENT 1 START 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 ),
    source character varying COLLATE pg_catalog."default" NOT NULL,
    target character varying COLLATE pg_catalog."default" NOT NULL,
    status character varying COLLATE pg_catalog."default" NOT NULL,
    source_url character varying COLLATE pg_catalog."default" NOT NULL,
    target_url character varying COLLATE pg_catalog."default" NOT NULL,
    message character varying COLLATE pg_catalog."default" NOT NULL,
    created_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PK_formatting_jobId" PRIMARY KEY (jobid)
)

TABLESPACE pg_default;