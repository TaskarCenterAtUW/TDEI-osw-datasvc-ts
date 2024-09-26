ALTER TABLE content.dataset
    DROP COLUMN dataset_area;

ALTER TABLE content.dataset
    ADD COLUMN dataset_area geometry(Geometry, 4326) 
    GENERATED ALWAYS AS (
        CASE
            WHEN ((((metadata_json -> 'dataset_area'::text) -> 'features'::text) IS NULL)
                 OR (json_array_length(((metadata_json -> 'dataset_area'::text) -> 'features'::text)) = 0))
            THEN NULL::geometry
            ELSE st_geomfromgeojson(((metadata_json -> 'dataset_area'::text) #>> '{features,0,geometry}'::text[]))
        END
    ) STORED;