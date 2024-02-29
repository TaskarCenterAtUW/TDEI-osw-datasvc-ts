CREATE SCHEMA IF NOT EXISTS Content;
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS content.dataset
(
    tdei_dataset_id character varying(40) DEFAULT uuid_generate_v4(),
    data_type character varying(20) COLLATE pg_catalog."default" NOT NULL,
    tdei_project_group_id character varying(40) COLLATE pg_catalog."default" NOT NULL,
    tdei_service_id character varying(40) COLLATE pg_catalog."default" NOT NULL,
    derived_from_dataset_id character varying(40) COLLATE pg_catalog."default",
    dataset_url character varying COLLATE pg_catalog."default" NOT NULL,
    metadata_url character varying COLLATE pg_catalog."default" NOT NULL,
    changeset_url character varying COLLATE pg_catalog."default",
    osm_url character varying COLLATE pg_catalog."default",
    status character varying(20) COLLATE pg_catalog."default",
    confidence_level real DEFAULT 0,
    cm_version character varying(10) COLLATE pg_catalog."default",
    cm_last_calculated_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    uploaded_timestamp timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    event_info json,
    node_info json,
    ext_point_info json,
    ext_line_info json,
    ext_polygon_info json,
    updated_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_by character varying(40) COLLATE pg_catalog."default" NOT NULL,
    uploaded_by character varying(40) COLLATE pg_catalog."default" NOT NULL,
    CONSTRAINT "PK_tdei_dataset_id" PRIMARY KEY (tdei_dataset_id)
);

CREATE TABLE IF NOT EXISTS content.metadata
(
    metadata_id bigint NOT NULL GENERATED ALWAYS AS IDENTITY ( INCREMENT 1 START 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 ),
    tdei_dataset_id character varying(40) COLLATE pg_catalog."default" NOT NULL,
    name character varying(100) COLLATE pg_catalog."default" NOT NULL,
    version character varying(20) COLLATE pg_catalog."default" NOT NULL,
    description text COLLATE pg_catalog."default",
    custom_metadata json,
    collected_by character varying(40) COLLATE pg_catalog."default" NOT NULL,
    collection_date timestamp without time zone NOT NULL,
    collection_method character varying(40) COLLATE pg_catalog."default",
    valid_from timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    valid_to timestamp without time zone,
    data_source character varying(40) COLLATE pg_catalog."default" NOT NULL,
    schema_version character varying(10) COLLATE pg_catalog."default" NOT NULL,
    dataset_area geometry,
    CONSTRAINT "PK_metadata_id" PRIMARY KEY (metadata_id),
    CONSTRAINT unq_meta_record_id UNIQUE (tdei_dataset_id),
    CONSTRAINT unq_name_version UNIQUE (name, version)
);

CREATE INDEX idx_dataset_area
    ON content.metadata USING gist
    (dataset_area);

CREATE TABLE IF NOT EXISTS content.workflow_history
(
    history_id bigint NOT NULL GENERATED ALWAYS AS IDENTITY ( INCREMENT 1 START 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 ),
    reference_id character varying(40) COLLATE pg_catalog."default" NOT NULL,
    workflow_group character varying(40) COLLATE pg_catalog."default" NOT NULL,
    request_message json NOT NULL,
    response_message json,
    created_timestamp timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_timestamp timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    workflow_stage character varying(40) COLLATE pg_catalog."default",
    message character varying COLLATE pg_catalog."default" GENERATED ALWAYS AS (((response_message -> 'data'::text) ->> 'message'::text)) STORED,
    status character varying COLLATE pg_catalog."default" GENERATED ALWAYS AS (
	CASE
    	WHEN (COALESCE(((response_message -> 'data'::text) ->> 'success'::text), ''::text) = ''::text) THEN ''::text
    	WHEN (((response_message -> 'data'::text) ->> 'success'::text))::boolean THEN 'Success'::text
    ELSE 'Failure'::text
	END) STORED,
    obsolete boolean,
    CONSTRAINT PK_workflow_history_id PRIMARY KEY (history_id)
);


CREATE TABLE IF NOT EXISTS content.validation_job
(
    job_id bigint NOT NULL GENERATED ALWAYS AS IDENTITY ( INCREMENT 1 START 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 ),
    upload_url character varying COLLATE pg_catalog."default" NOT NULL,
    status character varying(40) COLLATE pg_catalog."default" NOT NULL,
    validation_result character varying COLLATE pg_catalog."default",
    created_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    requested_by character varying(40) COLLATE pg_catalog."default",
    CONSTRAINT "PK_validation_job_id" PRIMARY KEY (job_id)
);

CREATE TABLE IF NOT EXISTS content.formatting_job
(
    job_id bigint NOT NULL GENERATED ALWAYS AS IDENTITY ( INCREMENT 1 START 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 ),
    source character varying(40) COLLATE pg_catalog."default" NOT NULL,
    target character varying(40) COLLATE pg_catalog."default" NOT NULL,
    status character varying COLLATE pg_catalog."default" NOT NULL,
    source_url character varying COLLATE pg_catalog."default" NOT NULL,
    target_url character varying COLLATE pg_catalog."default" NOT NULL,
    message character varying COLLATE pg_catalog."default" NOT NULL,
    created_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    requested_by character varying(40) COLLATE pg_catalog."default",
    CONSTRAINT "PK_formatting_job_id" PRIMARY KEY (job_id)
);

CREATE TABLE IF NOT EXISTS content.confidence_job
(
    job_id bigint NOT NULL GENERATED ALWAYS AS IDENTITY ( INCREMENT 1 START 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 ),
    confidence_metric real DEFAULT 0,
    trigger_type character varying(40) COLLATE pg_catalog."default" NOT NULL,
    created_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    status character varying(40) COLLATE pg_catalog."default" NOT NULL,
    user_id character varying(40) COLLATE pg_catalog."default",
    cm_version character varying COLLATE pg_catalog."default",
    cm_last_calculated_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PK_id" PRIMARY KEY (job_id)
);

CREATE TABLE IF NOT EXISTS content.backend_job
(
    job_id bigint NOT NULL GENERATED ALWAYS AS IDENTITY ( INCREMENT 1 START 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 ),
    tdei_dataset_id character varying(40) COLLATE pg_catalog."default" NOT NULL,
    status character varying(40) COLLATE pg_catalog."default" NOT NULL,
    message character varying COLLATE pg_catalog."default",
    download_url character varying COLLATE pg_catalog."default",
    created_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    requested_by character varying(40) COLLATE pg_catalog."default",
    CONSTRAINT "PK_backend_job_id" PRIMARY KEY (job_id)
);

CREATE TABLE IF NOT EXISTS content.dataset_flattern_job
(
    job_id bigint NOT NULL GENERATED ALWAYS AS IDENTITY ( INCREMENT 1 START 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 ),
    tdei_dataset_id character varying(40) COLLATE pg_catalog."default" NOT NULL,
    status character varying(40) COLLATE pg_catalog."default" NOT NULL,
    message character varying COLLATE pg_catalog."default",
    created_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    requested_by character varying(40) COLLATE pg_catalog."default",
    CONSTRAINT "PK_dataset_flattern_job_id" PRIMARY KEY (job_id)
);

CREATE TABLE IF NOT EXISTS content.edge
(
    id bigint NOT NULL GENERATED ALWAYS AS IDENTITY ( INCREMENT 1 START 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 ),
    tdei_dataset_id character varying(40) COLLATE pg_catalog."default" NOT NULL,
    feature json NOT NULL,
	edge_id bigint GENERATED ALWAYS AS ((feature->'properties'->>'_id')::bigint) STORED,
    edge_loc geometry(LineString, 4326) GENERATED ALWAYS AS (ST_SetSRID(ST_GeomFromGeoJSON(feature->>'geometry'), 4326)) STORED,
	orig_node_id bigint GENERATED ALWAYS AS ((feature->'properties'->>'_u_id')::bigint) STORED,
	dest_node_id bigint GENERATED ALWAYS AS ((feature->'properties'->>'_v_id')::bigint) STORED,
	name character varying GENERATED ALWAYS AS ((feature->'properties'->>'name')::text) STORED,
	highway character varying GENERATED ALWAYS AS ((feature->'properties'->>'highway')::text) STORED,
	service character varying GENERATED ALWAYS AS ((feature->'properties'->>'service')::text) STORED,
	footway character varying GENERATED ALWAYS AS ((feature->'properties'->>'footway')::text) STORED,
	foot character varying GENERATED ALWAYS AS ((feature->'properties'->>'foot')::text) STORED,
	description character varying GENERATED ALWAYS AS ((feature->'properties'->>'description')::text) STORED,
	incline real GENERATED ALWAYS AS ((feature->'properties'->>'incline')::real) STORED,
	surface character varying GENERATED ALWAYS AS ((feature->'properties'->>'surface')::text) STORED,
	length real GENERATED ALWAYS AS ((feature->'properties'->>'length')::real) STORED,
	width real GENERATED ALWAYS AS ((feature->'properties'->>'width')::real) STORED,
	tactile_paving character varying GENERATED ALWAYS AS ((feature->'properties'->>'tactile_paving')::text) STORED,
	crossing_markings character varying GENERATED ALWAYS AS ((feature->'properties'->>'crossing:markings')::text) STORED,
	step_count integer GENERATED ALWAYS AS ((feature->'properties'->>'step_count')::integer) STORED,
	climb character varying GENERATED ALWAYS AS ((feature->'properties'->>'climb')::text) STORED,
	building character varying GENERATED ALWAYS AS ((feature->'properties'->>'building')::text) STORED,
	opening_hours character varying GENERATED ALWAYS AS ((feature->'properties'->>'opening_hours')::text) STORED,
    created_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    requested_by character varying(40) COLLATE pg_catalog."default",
    CONSTRAINT "PK_edge_id" PRIMARY KEY (id),
    CONSTRAINT unq_dataset_edge_id UNIQUE (tdei_dataset_id, edge_id)
);

CREATE INDEX idx_edge_location
    ON content.edge USING gist
    (edge_loc);
	
CREATE TABLE IF NOT EXISTS content.node
(
    id bigint NOT NULL GENERATED ALWAYS AS IDENTITY ( INCREMENT 1 START 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 ),
    tdei_dataset_id character varying(40) COLLATE pg_catalog."default" NOT NULL,
    feature json NOT NULL,
    node_loc geometry(Point, 4326) GENERATED ALWAYS AS (ST_SetSRID(ST_GeomFromGeoJSON(feature->>'geometry'), 4326)) STORED,
	node_id bigint GENERATED ALWAYS AS ((feature->'properties'->>'_id')::bigint) STORED,
	barrier character varying GENERATED ALWAYS AS ((feature->'properties'->>'barrier')::text) STORED,
	kerb character varying GENERATED ALWAYS AS ((feature->'properties'->>'kerb')::text) STORED,
	tactile_paving character varying GENERATED ALWAYS AS ((feature->'properties'->>'tactile_paving')::text) STORED,
    created_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    requested_by character varying(40) COLLATE pg_catalog."default",
    CONSTRAINT "PK_node_id" PRIMARY KEY (id),
    CONSTRAINT unq_dataset_node_id UNIQUE (tdei_dataset_id, node_id)
);

CREATE INDEX idx_nodes_location
    ON content.node USING gist
    (node_loc);
	
CREATE TABLE IF NOT EXISTS content.extension_point
(
    id bigint NOT NULL GENERATED ALWAYS AS IDENTITY ( INCREMENT 1 START 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 ),
    tdei_dataset_id character varying(40) COLLATE pg_catalog."default" NOT NULL,
    feature json NOT NULL,
    point_loc geometry(Point, 4326) GENERATED ALWAYS AS (ST_SetSRID(ST_GeomFromGeoJSON(feature->>'geometry'), 4326)) STORED,
	point_id bigint GENERATED ALWAYS AS ((feature->'properties'->>'_id')::bigint) STORED,
	emergency character varying GENERATED ALWAYS AS ((feature->'properties'->>'emergency')::text) STORED,
	power character varying GENERATED ALWAYS AS ((feature->'properties'->>'power')::text) STORED,
	highway character varying GENERATED ALWAYS AS ((feature->'properties'->>'highway')::text) STORED,
	amenity character varying GENERATED ALWAYS AS ((feature->'properties'->>'amenity')::text) STORED,
	barrier character varying GENERATED ALWAYS AS ((feature->'properties'->>'barrier')::text) STORED,
    created_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    requested_by character varying(40) COLLATE pg_catalog."default",
    CONSTRAINT "PK_point_id" PRIMARY KEY (id),
    CONSTRAINT unq_dataset_point_id UNIQUE (tdei_dataset_id, point_id)
);

CREATE INDEX idx_point_location
    ON content.extension_point USING gist
    (point_loc);
	
CREATE TABLE IF NOT EXISTS content.extension_polygon
(
    id bigint NOT NULL GENERATED ALWAYS AS IDENTITY ( INCREMENT 1 START 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 ),
    tdei_dataset_id character varying(40) COLLATE pg_catalog."default" NOT NULL,
    feature json NOT NULL,
    polygon_loc geometry(Polygon, 4326) GENERATED ALWAYS AS (ST_SetSRID(ST_GeomFromGeoJSON(feature->>'geometry'), 4326)) STORED,
	polygon_id bigint GENERATED ALWAYS AS ((feature->'properties'->>'_id')::bigint) STORED,
	building character varying GENERATED ALWAYS AS ((feature->'properties'->>'building')::text) STORED,
	name character varying GENERATED ALWAYS AS ((feature->'properties'->>'name')::text) STORED,
	opening_hours character varying GENERATED ALWAYS AS ((feature->'properties'->>'opening_hours')::text) STORED,
    created_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    requested_by character varying(40) COLLATE pg_catalog."default",
    CONSTRAINT "PK_polygon_id" PRIMARY KEY (id),
    CONSTRAINT unq_dataset_polygon_id UNIQUE (tdei_dataset_id, polygon_id)
);

CREATE INDEX idx_polygon_location
    ON content.extension_polygon USING gist
    (polygon_loc);

CREATE TABLE IF NOT EXISTS content.extension_line
(
    id bigint NOT NULL GENERATED ALWAYS AS IDENTITY ( INCREMENT 1 START 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 ),
    tdei_dataset_id character varying(40) COLLATE pg_catalog."default" NOT NULL,
    feature json NOT NULL,
    line_loc geometry(LineString, 4326) GENERATED ALWAYS AS (ST_SetSRID(ST_GeomFromGeoJSON(feature->>'geometry'), 4326)) STORED,
	line_id bigint GENERATED ALWAYS AS ((feature->'properties'->>'_id')::bigint) STORED,
	barrier character varying GENERATED ALWAYS AS ((feature->'properties'->>'barrier')::text) STORED,
	length character varying GENERATED ALWAYS AS ((feature->'properties'->>'length')::text) STORED,
    created_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    requested_by character varying(40) COLLATE pg_catalog."default",
    CONSTRAINT "PK_line_id" PRIMARY KEY (id),
    CONSTRAINT unq_dataset_line_id UNIQUE (tdei_dataset_id, line_id)
);

CREATE INDEX idx_line_location
    ON content.extension_line USING gist
    (line_loc);
