-- Rollback script for content.edge
ALTER TABLE content.edge DROP CONSTRAINT unq_dataset_edge_id;
ALTER TABLE content.edge DROP COLUMN edge_id;
ALTER TABLE content.edge DROP COLUMN orig_node_id;
ALTER TABLE content.edge DROP COLUMN dest_node_id;

ALTER TABLE content.edge
ADD COLUMN edge_id bigint GENERATED ALWAYS AS ((((feature -> 'properties'::text) ->> '_id'::text))::bigint) STORED,
ADD COLUMN orig_node_id bigint GENERATED ALWAYS AS ((((feature -> 'properties'::text) ->> '_u_id'::text))::bigint) STORED,
ADD COLUMN dest_node_id bigint GENERATED ALWAYS AS ((((feature -> 'properties'::text) ->> '_v_id'::text))::bigint) STORED;

ALTER TABLE content.edge ADD CONSTRAINT unq_dataset_edge_id UNIQUE (tdei_dataset_id, edge_id);

-- Rollback script for content.extension_line
ALTER TABLE content.extension_line DROP CONSTRAINT unq_dataset_line_id;
ALTER TABLE content.extension_line DROP COLUMN line_id;

ALTER TABLE content.extension_line
ADD COLUMN line_id bigint GENERATED ALWAYS AS ((((feature -> 'properties'::text) ->> '_id'::text))::bigint) STORED;

ALTER TABLE content.extension_line ADD CONSTRAINT unq_dataset_line_id UNIQUE (tdei_dataset_id, line_id);

-- Rollback script for content.extension_point
ALTER TABLE content.extension_point DROP CONSTRAINT unq_dataset_point_id;
ALTER TABLE content.extension_point DROP COLUMN point_id;

ALTER TABLE content.extension_point
ADD COLUMN point_id bigint GENERATED ALWAYS AS ((((feature -> 'properties'::text) ->> '_id'::text))::bigint) STORED;

ALTER TABLE content.extension_point ADD CONSTRAINT unq_dataset_point_id UNIQUE (tdei_dataset_id, point_id);

-- Rollback script for content.extension_polygon
ALTER TABLE content.extension_polygon DROP CONSTRAINT unq_dataset_polygon_id;
ALTER TABLE content.extension_polygon DROP COLUMN polygon_id;

ALTER TABLE content.extension_polygon
ADD COLUMN polygon_id bigint GENERATED ALWAYS AS ((((feature -> 'properties'::text) ->> '_id'::text))::bigint) STORED;

ALTER TABLE content.extension_polygon ADD CONSTRAINT unq_dataset_polygon_id UNIQUE (tdei_dataset_id, polygon_id);

-- Rollback script for content.node
ALTER TABLE content.node DROP CONSTRAINT unq_dataset_node_id;
ALTER TABLE content.node DROP COLUMN node_id;

ALTER TABLE content.node
ADD COLUMN node_id bigint GENERATED ALWAYS AS ((((feature -> 'properties'::text) ->> '_id'::text))::bigint) STORED;

ALTER TABLE content.node ADD CONSTRAINT unq_dataset_node_id UNIQUE (tdei_dataset_id, node_id);

-- Rollback script for content.zone
ALTER TABLE content.zone DROP CONSTRAINT unq_dataset_zone_id;
ALTER TABLE content.zone DROP COLUMN zone_id;
ALTER TABLE content.zone DROP COLUMN node_ids;

DROP function content.zone_extract_w_id(json);
CREATE FUNCTION content.zone_extract_w_id(json_data JSON) RETURNS bigint[]
AS $$
    SELECT ARRAY(
        SELECT CAST(value AS bigint)
        FROM JSON_ARRAY_ELEMENTS_TEXT(json_data->'properties'->'_w_id') AS elements(value)
    );
$$ LANGUAGE SQL IMMUTABLE;

ALTER TABLE content.zone
ADD COLUMN zone_id bigint GENERATED ALWAYS AS ((((feature -> 'properties'::text) ->> '_id'::text))::bigint) STORED,
ADD COLUMN node_ids bigint[] GENERATED ALWAYS AS (content.zone_extract_w_id(feature)) STORED;

ALTER TABLE content.zone ADD CONSTRAINT unq_dataset_zone_id UNIQUE (tdei_dataset_id, zone_id);
