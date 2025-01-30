-- Drop indexes
DROP INDEX IF EXISTS idx_download_stats_user_id;
DROP INDEX IF EXISTS idx_download_stats_requested_datetime;

-- Drop the content.download_stats table
DROP TABLE IF EXISTS content.download_stats;
