-- Create the content.download_stats table
CREATE TABLE IF NOT EXISTS content.download_stats (
    id BIGINT NOT NULL GENERATED ALWAYS AS IDENTITY (INCREMENT 1 START 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1),
    user_id CHARACTER VARYING(40) COLLATE pg_catalog."default" NOT NULL,
    requested_datetime TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    blob_url CHARACTER VARYING COLLATE pg_catalog."default" NOT NULL,
    file_size BIGINT NOT NULL,
    tdei_dataset_id CHARACTER VARYING(40) COLLATE pg_catalog."default" NOT NULL,
    data_type CHARACTER VARYING(20) COLLATE pg_catalog."default" NOT NULL,
    CONSTRAINT pk_download_stats_id PRIMARY KEY (id),
    CONSTRAINT fk_download_stats_dataset FOREIGN KEY (tdei_dataset_id)
        REFERENCES content.dataset (tdei_dataset_id) ON DELETE CASCADE
);

-- Create an index on user_id for efficient lookups
CREATE INDEX IF NOT EXISTS idx_download_stats_user_id
    ON content.download_stats (user_id);

-- Create an index on requested_datetime for efficient filtering
CREATE INDEX IF NOT EXISTS idx_download_stats_requested_datetime
    ON content.download_stats (requested_datetime);
