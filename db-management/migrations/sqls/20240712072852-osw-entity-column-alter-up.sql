ALTER TABLE content.edge
DROP COLUMN IF EXISTS "crossing_markings";

ALTER TABLE content.edge
ADD COLUMN IF NOT EXISTS "crossing:markings" character varying GENERATED ALWAYS AS ((feature->'properties'->>'crossing:markings')::text) STORED;