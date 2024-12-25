ALTER TABLE IF EXISTS content.dataset
    ADD COLUMN IF NOT EXISTS  extension_info json;



CREATE TABLE IF NOT EXISTS content.extension
(
    id bigint NOT NULL GENERATED ALWAYS AS IDENTITY ( INCREMENT 1 START 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 ),
    tdei_dataset_id character varying(40) COLLATE pg_catalog."default" NOT NULL,
    feature json NOT NULL,
	ext_id bigint GENERATED ALWAYS AS ((feature->'properties'->>'_id')::bigint) STORED,
    ext_loc geometry(Geometry, 4326) GENERATED ALWAYS AS (ST_SetSRID(ST_GeomFromGeoJSON(feature->>'geometry'), 4326)) STORED,
    created_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    requested_by character varying(40) COLLATE pg_catalog."default",
    CONSTRAINT "PK_ext_id" PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_ext_location
    ON content.extension USING gist
    (ext_loc);