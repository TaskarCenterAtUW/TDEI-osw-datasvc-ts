ALTER TABLE IF EXISTS public.osw_versions DROP COLUMN IF EXISTS collected_by;

ALTER TABLE IF EXISTS public.osw_versions DROP COLUMN IF EXISTS collection_date;

ALTER TABLE IF EXISTS public.osw_versions DROP COLUMN IF EXISTS collection_method;

ALTER TABLE IF EXISTS public.osw_versions DROP COLUMN IF EXISTS data_source;

ALTER TABLE IF EXISTS public.osw_versions DROP COLUMN IF EXISTS osw_schema_version;

ALTER TABLE IF EXISTS public.osw_versions DROP COLUMN IF EXISTS polygon;

ALTER TABLE IF EXISTS public.osw_versions DROP COLUMN IF EXISTS publication_date;

ALTER TABLE IF EXISTS public.osw_versions DROP COLUMN IF EXISTS osm_upload_path;

ALTER TABLE IF EXISTS public.osw_versions DROP COLUMN IF EXISTS pbf_upload_path;

ALTER TABLE IF EXISTS public.osw_versions
    RENAME tdei_org_id TO tdei_project_group_id;

ALTER TABLE IF EXISTS public.osw_versions
    RENAME file_upload_path TO download_osw_url;

ALTER TABLE IF EXISTS public.osw_versions
    RENAME uploaded_date TO uploaded_timestamp;

ALTER TABLE IF EXISTS public.osw_versions
 ADD COLUMN derived_from_dataset_id character varying;  

ALTER TABLE IF EXISTS public.osw_versions
 ADD COLUMN status character varying;  

ALTER TABLE IF EXISTS public.osw_versions
 ADD COLUMN tdei_service_id character varying;  

 ALTER TABLE IF EXISTS public.osw_versions
 ADD COLUMN download_changeset_url character varying; 

 ALTER TABLE IF EXISTS public.osw_versions
 ADD COLUMN download_metadata_url character varying; 

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
    collection_method character varying COLLATE pg_catalog."default",
    valid_from timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    valid_to timestamp without time zone,
    data_source character varying COLLATE pg_catalog."default" NOT NULL,
    osw_schema_version character varying COLLATE pg_catalog."default" NOT NULL,
    dataset_area geometry,
    CONSTRAINT "PK_metadata_id" PRIMARY KEY (id),
    CONSTRAINT unq_name_version UNIQUE (name, version),
    CONSTRAINT unq_record_id UNIQUE (tdei_record_id)
)

CREATE TABLE IF NOT EXISTS public.osw_validation_jobs
(
    job_id bigint NOT NULL GENERATED ALWAYS AS IDENTITY ( INCREMENT 1 START 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 ),
    upload_url character varying COLLATE pg_catalog."default" NOT NULL,
    status character varying COLLATE pg_catalog."default" NOT NULL,
    validation_result character varying COLLATE pg_catalog."default",
    created_at  timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
     CONSTRAINT "PK_validation_job_id" PRIMARY KEY (job_id)
)

CREATE TABLE IF NOT EXISTS public.osw_workflow_history
(
    id bigint NOT NULL GENERATED ALWAYS AS IDENTITY ( INCREMENT 1 START 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 ),
    reference_id character varying COLLATE pg_catalog."default" NOT NULL,
    workflow_group character varying COLLATE pg_catalog."default" NOT NULL,
    request_message json NOT NULL,
    response_message json,
    created_timestamp timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_timestamp timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    workflow_stage character varying COLLATE pg_catalog."default",
    message text COLLATE pg_catalog."default" GENERATED ALWAYS AS (((response_message -> 'data'::text) ->> 'message'::text)) STORED,
    status text COLLATE pg_catalog."default" GENERATED ALWAYS AS (
CASE
    WHEN (COALESCE(((response_message -> 'data'::text) ->> 'success'::text), ''::text) = ''::text) THEN ''::text
    WHEN (((response_message -> 'data'::text) ->> 'success'::text))::boolean THEN 'Success'::text
    ELSE 'Failure'::text
END) STORED,
    obsolete boolean,
    CONSTRAINT osw_workflow_history_pkey PRIMARY KEY (id)
)
