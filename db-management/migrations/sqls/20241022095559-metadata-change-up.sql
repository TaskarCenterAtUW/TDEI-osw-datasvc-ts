UPDATE content.dataset
SET metadata_json = jsonb_set(
    metadata_json::jsonb - 'key_limitations_of_the_dataset',
    '{key_limitations}', (metadata_json->'key_limitations_of_the_dataset')::jsonb
)::json
WHERE metadata_json::jsonb ? 'key_limitations_of_the_dataset' ;


CREATE OR REPLACE FUNCTION content.tdei_json_read_date(
	json_data json,
	key_name text)
    RETURNS timestamp without time zone
    LANGUAGE 'plpgsql'
    COST 100
    IMMUTABLE PARALLEL UNSAFE
AS $BODY$
BEGIN
    IF json_data ->> key_name IS NOT NULL THEN
        RETURN (json_data ->> key_name)::timestamp without time zone;
    ELSE
        RETURN null;
    END IF;
END;
$BODY$;