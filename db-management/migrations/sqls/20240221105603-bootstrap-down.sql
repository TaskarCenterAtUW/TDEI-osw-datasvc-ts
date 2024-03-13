-- Drop tables
DROP TABLE IF EXISTS content.extension_line;
DROP TABLE IF EXISTS content.extension_polygon;
DROP TABLE IF EXISTS content.extension_point;
DROP TABLE IF EXISTS content.node;
DROP TABLE IF EXISTS content.edge;
DROP TABLE IF EXISTS content.backend_job;
DROP TABLE IF EXISTS content.confidence_job;
DROP TABLE IF EXISTS content.formatting_job;
DROP TABLE IF EXISTS content.validation_job;
DROP TABLE IF EXISTS content.workflow_history;
DROP TABLE IF EXISTS content.metadata;
DROP TABLE IF EXISTS content.dataset;

-- Drop schema
DROP SCHEMA IF EXISTS Content CASCADE;

-- Drop extensions
DROP EXTENSION IF EXISTS "uuid-ossp";
DROP EXTENSION IF EXISTS postgis;
