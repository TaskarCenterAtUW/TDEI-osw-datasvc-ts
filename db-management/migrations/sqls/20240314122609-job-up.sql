CREATE TABLE IF NOT EXISTS content.job
(
    job_id bigint NOT NULL GENERATED ALWAYS AS IDENTITY ( INCREMENT 1 START 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 ),
    job_type character varying(100) COLLATE pg_catalog."default" NOT NULL,
    data_type character varying(30) COLLATE pg_catalog."default" NOT NULL,
    request_input json NOT NULL,
    status character varying(100) COLLATE pg_catalog."default" NOT NULL,
    message text COLLATE pg_catalog."default",
    response_props json,
    user_id character varying(40) COLLATE pg_catalog."default" NOT NULL,
    tdei_project_group_id character varying(40) COLLATE pg_catalog."default" NOT NULL,
    created_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    download_url text COLLATE pg_catalog."default",
    CONSTRAINT job_id_pkey PRIMARY KEY (job_id)
)