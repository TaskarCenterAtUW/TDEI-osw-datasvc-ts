-- Database: osw

-- DROP DATABASE IF EXISTS osw;

CREATE DATABASE osw
    WITH
    OWNER = tdeiadmin
    ENCODING = 'UTF8'
    LC_COLLATE = 'en_US.utf8'
    LC_CTYPE = 'en_US.utf8'
    TABLESPACE = pg_default
    CONNECTION LIMIT = -1
    IS_TEMPLATE = False;

-- Table: public.osw_versions

-- DROP TABLE IF EXISTS public.osw_versions;

CREATE TABLE IF NOT EXISTS public.osw_versions
(
    id integer NOT NULL DEFAULT nextval('osw_versions_id_seq'::regclass),
    tdei_record_id character varying COLLATE pg_catalog."default" NOT NULL,
    confidence_level integer DEFAULT 0,
    tdei_org_id character varying COLLATE pg_catalog."default" NOT NULL,
    tdei_service_id character varying COLLATE pg_catalog."default" NOT NULL,
    file_upload_path character varying COLLATE pg_catalog."default" NOT NULL,
    uploaded_by character varying COLLATE pg_catalog."default" NOT NULL,
    collected_by character varying COLLATE pg_catalog."default" NOT NULL,
    collection_date timestamp without time zone NOT NULL,
    collection_method character varying COLLATE pg_catalog."default" NOT NULL,
    valid_from timestamp without time zone NOT NULL,
    valid_to timestamp without time zone NOT NULL,
    data_source character varying COLLATE pg_catalog."default" NOT NULL,
    flex_schema_version character varying COLLATE pg_catalog."default" NOT NULL,
    uploaded_date timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    polygon geometry,
    CONSTRAINT "PK_7e3d24ec6024b551e5612baae54" PRIMARY KEY (id),
    CONSTRAINT unq_record_id UNIQUE (tdei_record_id)
)

TABLESPACE pg_default;

ALTER TABLE IF EXISTS public.osw_versions
    OWNER to tdeiadmin;
-- Index: polygon_geom_idx

-- DROP INDEX IF EXISTS public.polygon_geom_idx;

CREATE INDEX IF NOT EXISTS polygon_geom_idx
    ON public.flex_versions USING gist
    (polygon)
    TABLESPACE pg_default;