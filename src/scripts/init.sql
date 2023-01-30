CREATE EXTENSION IF NOT EXISTS postgis;
-- Enable Topology
CREATE EXTENSION IF NOT EXISTS postgis_topology;

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
	updated_date timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    polygon geometry,
    CONSTRAINT "PK_id" PRIMARY KEY (id)
)

TABLESPACE pg_default;