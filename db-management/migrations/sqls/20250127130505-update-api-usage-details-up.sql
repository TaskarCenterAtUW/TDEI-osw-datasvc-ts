ALTER TABLE content.api_usage_details
ADD COLUMN response_status INTEGER,
ADD COLUMN response_time BIGINT;