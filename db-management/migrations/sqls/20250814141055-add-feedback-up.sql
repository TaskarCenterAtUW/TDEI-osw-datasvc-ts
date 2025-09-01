CREATE TABLE IF NOT EXISTS content.feedback (
    id bigint NOT NULL GENERATED ALWAYS AS IDENTITY ( INCREMENT 1 START 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 ),
    tdei_project_id character varying(40) NOT NULL,
    tdei_dataset_id character varying(40) NOT NULL,
    dataset_element_id character varying(40),
    feedback_text TEXT NOT NULL,
    customer_email character varying(255),
    location_latitude DOUBLE PRECISION,
    location_longitude DOUBLE PRECISION,
    due_date TIMESTAMP without TIME ZONE NOT NULL,
    status character varying(20) NOT NULL DEFAULT 'open',
    created_at TIMESTAMP without TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP without TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PK_feedback_id" PRIMARY KEY (id)
);
