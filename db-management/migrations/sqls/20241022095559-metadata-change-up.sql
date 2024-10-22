UPDATE content.dataset
SET metadata_json = jsonb_set(
    metadata_json::jsonb - 'key_limitations_of_the_dataset',
    '{key_limitations}', (metadata_json->'key_limitations_of_the_dataset')::jsonb
)::json
WHERE metadata_json::jsonb ? 'key_limitations_of_the_dataset' ;