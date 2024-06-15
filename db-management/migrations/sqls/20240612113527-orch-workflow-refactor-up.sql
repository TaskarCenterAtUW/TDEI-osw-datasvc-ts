
CREATE TABLE IF NOT EXISTS content.workflow_details
(
    execution_id character varying(40) NOT NULL DEFAULT uuid_generate_v4(),
    job_id integer NOT NULL,
    workflow_name character varying(255) NOT NULL,
   	status character varying(100) GENERATED ALWAYS AS ((workflow_context->>'status')::text) STORED,
   	current_task character varying(255) GENERATED ALWAYS AS ((workflow_context->>'current_task')::text) STORED,
   	current_task_status character varying(100) GENERATED ALWAYS AS ((workflow_context->>'current_task_status')::text) STORED,
   	current_task_description character varying(1000) GENERATED ALWAYS AS ((workflow_context->>'current_task_description')::text) STORED,
   	current_task_error text GENERATED ALWAYS AS ((workflow_context->>'current_task_error')::text) STORED,
    start_time character varying(100) GENERATED ALWAYS AS ((workflow_context->>'start_time')::text) STORED,    
    end_time character varying(100) GENERATED ALWAYS AS ((workflow_context->>'end_time')::text) STORED,    
    last_updated_at character varying(100) GENERATED ALWAYS AS ((workflow_context->>'last_updated_at')::text) STORED,    
	total_workflow_tasks int GENERATED ALWAYS AS ((workflow_context->>'total_workflow_tasks')::int) STORED,
    tasks_track_number int GENERATED ALWAYS AS ((workflow_context->>'tasks_track_number')::int) STORED,    
    workflow_context json NOT NULL,
    created_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    triggered_by character varying(255),
    CONSTRAINT workflow_details_pkey PRIMARY KEY (execution_id)
)