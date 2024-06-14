CREATE TABLE content.workflow_details (
    execution_id character varying(40) DEFAULT uuid_generate_v4(),
    job_id INT NOT NULL,
    workflow_name VARCHAR(255) NOT NULL,
    workflow_context JSON NOT NULL,
    status VARCHAR(255) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    triggered_by VARCHAR(255),
    PRIMARY KEY (execution_id)
);