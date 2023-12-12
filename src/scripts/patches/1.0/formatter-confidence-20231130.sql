-- OSW formatter release script
ALTER TABLE IF EXISTS public.osw_versions
    ADD COLUMN download_osm_url character varying;

ALTER TABLE IF EXISTS public.osw_versions
    ADD COLUMN download_xml_url character varying;

-- Confidence matric

ALTER TABLE IF EXISTS public.osw_versions
    ADD COLUMN cm_version character varying;

ALTER TABLE IF EXISTS public.osw_versions
ADD COLUMN cm_last_calculated_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP;