ALTER TABLE content.edge DROP CONSTRAINT unq_dataset_edge_id;
ALTER TABLE content.edge DROP COLUMN edge_id;
ALTER TABLE content.edge DROP COLUMN orig_node_id;
ALTER TABLE content.edge DROP COLUMN dest_node_id;

ALTER TABLE content.edge
ADD COLUMN edge_id character varying(100) GENERATED ALWAYS AS ((((feature -> 'properties'::text) ->> '_id'::text))::character varying) STORED,
ADD COLUMN orig_node_id character varying(100) GENERATED ALWAYS AS ((((feature -> 'properties'::text) ->> '_u_id'::text))::character varying) STORED,
ADD COLUMN dest_node_id character varying(100) GENERATED ALWAYS AS ((((feature -> 'properties'::text) ->> '_v_id'::text))::character varying) STORED;

ALTER TABLE content.edge ADD CONSTRAINT unq_dataset_edge_id UNIQUE (tdei_dataset_id, edge_id);


ALTER TABLE content.extension_line DROP CONSTRAINT unq_dataset_line_id;
ALTER TABLE content.extension_line DROP COLUMN line_id;

ALTER TABLE content.extension_line
ADD COLUMN line_id character varying(100) GENERATED ALWAYS AS ((((feature -> 'properties'::text) ->> '_id'::text))::character varying) STORED;

ALTER TABLE content.extension_line ADD CONSTRAINT unq_dataset_line_id UNIQUE (tdei_dataset_id, line_id);

ALTER TABLE content.extension_point DROP CONSTRAINT unq_dataset_point_id;
ALTER TABLE content.extension_point DROP COLUMN point_id;

ALTER TABLE content.extension_point
ADD COLUMN point_id character varying(100) GENERATED ALWAYS AS ((((feature -> 'properties'::text) ->> '_id'::text))::character varying) STORED;

ALTER TABLE content.extension_point ADD CONSTRAINT unq_dataset_point_id UNIQUE (tdei_dataset_id, point_id);


ALTER TABLE content.extension_polygon DROP CONSTRAINT unq_dataset_polygon_id;
ALTER TABLE content.extension_polygon DROP COLUMN polygon_id;

ALTER TABLE content.extension_polygon
ADD COLUMN polygon_id character varying(100) GENERATED ALWAYS AS ((((feature -> 'properties'::text) ->> '_id'::text))::character varying) STORED;

ALTER TABLE content.extension_polygon ADD CONSTRAINT unq_dataset_polygon_id UNIQUE (tdei_dataset_id, polygon_id);


ALTER TABLE content.node DROP CONSTRAINT unq_dataset_node_id;
ALTER TABLE content.node DROP COLUMN node_id;

ALTER TABLE content.node
ADD COLUMN node_id character varying(100) GENERATED ALWAYS AS ((((feature -> 'properties'::text) ->> '_id'::text))::character varying) STORED;

ALTER TABLE content.node ADD CONSTRAINT unq_dataset_node_id UNIQUE (tdei_dataset_id, node_id);

ALTER TABLE content.zone DROP CONSTRAINT unq_dataset_zone_id;
ALTER TABLE content.zone DROP COLUMN zone_id;
ALTER TABLE content.zone DROP COLUMN node_ids;

DROP function content.zone_extract_w_id(json);
CREATE OR REPLACE FUNCTION content.zone_extract_w_id(json_data JSON) RETURNS character varying[]
AS $$
    SELECT ARRAY(
        SELECT value::character varying
        FROM JSON_ARRAY_ELEMENTS_TEXT(json_data->'properties'->'_w_id') AS elements(value)
    );
$$ LANGUAGE SQL IMMUTABLE;

ALTER TABLE content.zone
ADD COLUMN zone_id character varying(100) GENERATED ALWAYS AS ((((feature -> 'properties'::text) ->> '_id'::text))::character varying) STORED,
ADD COLUMN node_ids character varying(100)[] GENERATED ALWAYS AS (content.zone_extract_w_id(feature)::character varying(100)[]) STORED;

ALTER TABLE content.zone ADD CONSTRAINT unq_dataset_zone_id UNIQUE (tdei_dataset_id, zone_id);

