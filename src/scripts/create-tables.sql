-- Master create table scripts. Keep this file upto date with latest new table or patch changes 

CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE IF NOT EXISTS public.osw_versions
(
	id bigint NOT NULL GENERATED ALWAYS AS IDENTITY ( INCREMENT 1 START 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 ),
    tdei_record_id character varying COLLATE pg_catalog."default" NOT NULL,
    derived_from_dataset_id character varying,
    confidence_level real DEFAULT 0,
    tdei_project_group_id character varying COLLATE pg_catalog."default" NOT NULL,
    download_osw_url character varying COLLATE pg_catalog."default" NOT NULL,
    uploaded_by character varying COLLATE pg_catalog."default" NOT NULL,
	uploaded_timestamp timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    cm_version character varying COLLATE pg_catalog."default",
    cm_last_calculated_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    download_osm_url character varying COLLATE pg_catalog."default",
    status character varying COLLATE pg_catalog."default",
    CONSTRAINT "PK_id" PRIMARY KEY (id),
    CONSTRAINT unq_record_id UNIQUE (tdei_record_id)
)

CREATE TABLE IF NOT EXISTS public.osw_metadata
(
	id bigint NOT NULL GENERATED ALWAYS AS IDENTITY ( INCREMENT 1 START 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 ),
    tdei_record_id character varying COLLATE pg_catalog."default" NOT NULL,
    name character varying COLLATE pg_catalog."default" NOT NULL,
    version character varying COLLATE pg_catalog."default" NOT NULL,
    description character varying,
    custom_metadata json,
    collected_by character varying COLLATE pg_catalog."default" NOT NULL,
    collection_date timestamp without time zone NOT NULL,
    collection_method character varying COLLATE pg_catalog."default" NOT NULL,
    valid_from timestamp without time zone NOT NULL,
    valid_to timestamp without time zone NOT NULL,
    data_source character varying COLLATE pg_catalog."default" NOT NULL,
    osw_schema_version character varying COLLATE pg_catalog."default" NOT NULL,
    dataset_area geometry,
    CONSTRAINT "PK_metadata_id" PRIMARY KEY (id),
    CONSTRAINT unq_name_version UNIQUE (name, version),
    CONSTRAINT unq_record_id UNIQUE (tdei_record_id)
)

TABLESPACE pg_default;

CREATE INDEX IF NOT EXISTS polygon_geom_idx
  ON osw_metadata
  USING GIST (dataset_area);
/* Table for confidence jobs */

CREATE TABLE IF NOT EXISTS public.osw_confidence_jobs
(
	jobId bigint NOT NULL GENERATED ALWAYS AS IDENTITY ( INCREMENT 1 START 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 ),
    tdei_record_id character varying COLLATE pg_catalog."default" NOT NULL,
    confidence_metric real DEFAULT 0,
    trigger_type character varying COLLATE pg_catalog."default" NOT NULL,
    created_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    status character varying COLLATE pg_catalog."default" NOT NULL,
    user_id character varying COLLATE pg_catalog."default",
    cm_version character varying COLLATE pg_catalog."default",
    cm_last_calculated_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PK_jobId_osw" PRIMARY KEY (jobId)
)

CREATE TABLE IF NOT EXISTS public.osw_formatting_jobs
(
    jobId bigint NOT NULL GENERATED ALWAYS AS IDENTITY ( INCREMENT 1 START 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 ),
    source character varying COLLATE pg_catalog."default" NOT NULL,
    target character varying COLLATE pg_catalog."default" NOT NULL,
    status character varying COLLATE pg_catalog."default" NOT NULL,
    source_url character varying COLLATE pg_catalog."default" NOT NULL,
    target_url character varying COLLATE pg_catalog."default" NOT NULL,
    message character varying COLLATE pg_catalog."default" NOT NULL,
    created_at  timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
     CONSTRAINT "PK_jobId" PRIMARY KEY (jobId)
)

CREATE TABLE IF NOT EXISTS public.osw_validation_jobs
(
    job_id bigint NOT NULL GENERATED ALWAYS AS IDENTITY ( INCREMENT 1 START 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 ),
    upload_url character varying COLLATE pg_catalog."default" NOT NULL,
    status character varying COLLATE pg_catalog."default" NOT NULL,
    validation_result character varying COLLATE pg_catalog."default" NOT NULL,
    created_at  timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
     CONSTRAINT "PK_validation_job_id" PRIMARY KEY (job_id)
)