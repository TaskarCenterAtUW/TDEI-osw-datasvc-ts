/* Replace with your SQL commands */
/* Alter table content.dataset to add a column named dataset_download_url which is varchar of 1024 value and default null */

ALTER TABLE content.dataset ADD COLUMN dataset_download_url character varying(1024) DEFAULT NULL;