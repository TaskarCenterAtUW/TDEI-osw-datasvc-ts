CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE IF NOT EXISTS public.osw_versions
(
	id bigint NOT NULL GENERATED ALWAYS AS IDENTITY ( INCREMENT 1 START 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 ),
    tdei_record_id character varying COLLATE pg_catalog."default" NOT NULL,
    confidence_level integer DEFAULT 0,
    tdei_org_id character varying COLLATE pg_catalog."default" NOT NULL,
    file_upload_path character varying COLLATE pg_catalog."default" NOT NULL,
    uploaded_by character varying COLLATE pg_catalog."default" NOT NULL,
    collected_by character varying COLLATE pg_catalog."default" NOT NULL,
    collection_date timestamp without time zone NOT NULL,
    collection_method character varying COLLATE pg_catalog."default" NOT NULL,
    valid_from timestamp without time zone NOT NULL,
    valid_to timestamp without time zone NOT NULL,
    data_source character varying COLLATE pg_catalog."default" NOT NULL,
    osw_schema_version character varying COLLATE pg_catalog."default" NOT NULL,
	uploaded_date timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    polygon geometry,
    CONSTRAINT "PK_id" PRIMARY KEY (id),
    CONSTRAINT unq_record_id UNIQUE (tdei_record_id)
)

TABLESPACE pg_default;

CREATE INDEX IF NOT EXISTS polygon_geom_idx
  ON osw_versions
  USING GIST (polygon);

  ALTER TABLE public.osw_versions DROP COLUMN valid_from, DROP COLUMN valid_to;
  ALTER TABLE public.osw_versions ADD COLUMN IF NOT EXISTS publication_date timestamp without time zone NOT NULL;
