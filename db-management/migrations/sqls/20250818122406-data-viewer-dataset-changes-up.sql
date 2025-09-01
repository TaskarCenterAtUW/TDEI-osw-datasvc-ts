ALTER TABLE content.dataset
ADD COLUMN IF NOT EXISTS data_viewer_allowed BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS pm_tiles_url character varying(5000);