-- Enforce at most one in-progress Quality-Report job per user.
-- This guards against concurrent Quality Report requests for the same user.

CREATE UNIQUE INDEX IF NOT EXISTS uq_job_user_quality_report_in_progress
ON content.job (user_id, job_type)
WHERE status = 'IN-PROGRESS' AND job_type = 'Quality-Report';

