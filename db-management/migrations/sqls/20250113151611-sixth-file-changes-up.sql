-- Union supporting function
CREATE OR REPLACE FUNCTION content.union_matchpoly(
	geometry,
	geometry,
	double precision)
    RETURNS boolean
    LANGUAGE 'sql'
    COST 100
    IMMUTABLE STRICT PARALLEL UNSAFE
AS $BODY$
select (ST_AREA(ST_INTERSECTION($1,$2)) / ST_AREA(ST_UNION($1,$2))) > $3;
$BODY$;

-- Fix for case sensitive status check
ALTER TABLE content.dataset DROP CONSTRAINT IF EXISTS dataset_name_version_unique;

ALTER TABLE content.dataset
ADD CONSTRAINT dataset_name_version_unique
EXCLUDE USING btree (name WITH =, version WITH =)
WHERE (status != 'Deleted');

-- Add ext_loc_3857 column to extension table for better query performance
ALTER TABLE content.extension
ADD COLUMN IF NOT EXISTS ext_loc_3857 geometry(Geometry, 3857) 
    GENERATED ALWAYS AS (
        ST_Transform(
            ST_GeomFromGeoJSON(feature ->> 'geometry'),
            3857
        )
    ) STORED;
	
CREATE INDEX IF NOT EXISTS idx_ext_loc_3857_gist ON content.extension USING GIST (ext_loc_3857);