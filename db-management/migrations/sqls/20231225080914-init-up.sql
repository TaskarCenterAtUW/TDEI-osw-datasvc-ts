CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE IF NOT EXISTS public.osw_versions
(
    id bigint NOT NULL GENERATED ALWAYS AS IDENTITY ( INCREMENT 1 START 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 ),
    tdei_record_id character varying COLLATE pg_catalog."default" NOT NULL,
    confidence_level integer DEFAULT 0,
    tdei_project_group_id character varying COLLATE pg_catalog."default" NOT NULL,
    file_upload_path character varying COLLATE pg_catalog."default" NOT NULL,
    uploaded_by character varying COLLATE pg_catalog."default" NOT NULL,
    collected_by character varying COLLATE pg_catalog."default" NOT NULL,
    collection_date timestamp without time zone NOT NULL,
    collection_method character varying COLLATE pg_catalog."default" NOT NULL,
    publication_date timestamp without time zone NOT NULL,
    data_source character varying COLLATE pg_catalog."default" NOT NULL,
    osw_schema_version character varying COLLATE pg_catalog."default" NOT NULL,
    uploaded_date timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    polygon geometry,
    CONSTRAINT "PK_version_id" PRIMARY KEY (id),
    CONSTRAINT unq_record_id UNIQUE (tdei_record_id)
)

TABLESPACE pg_default;

-- Index: polygon_geom_idx

-- DROP INDEX IF EXISTS public.polygon_geom_idx;

CREATE INDEX IF NOT EXISTS polygon_geom_idx
    ON public.osw_versions USING gist
    (polygon)
    TABLESPACE pg_default;