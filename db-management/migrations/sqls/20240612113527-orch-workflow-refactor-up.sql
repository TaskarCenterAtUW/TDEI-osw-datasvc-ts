CREATE TABLE content.workflow_details (
    execution_id character varying(40) DEFAULT uuid_generate_v4(),
    job_id INT NOT NULL,
    workflow_name VARCHAR(255) NOT NULL,
    workflow_context JSON NOT NULL,
    status VARCHAR(255) NOT NULL GENERATED ALWAYS AS (workflow_context->>'status') STORED,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    triggered_by VARCHAR(255)
    PRIMARY KEY (execution_id)
);


-- {
--     "workflow_input" : {
--         "input1" : "value1",
--         "input2" : "value2"
--     },
--     "start_time" : "2024-06-12 11:35:27",
--     "end_time" : "2024-06-12 11:35:27",
--     "is_terminated" : "true",
--     "terminated_reason" : "reson",
--     "terminated_at" : "2024-06-12 11:35:27",
--     "status" : "RUNNING|COMPLETED|FAILED",
--     "current_task" : "task1",
--     "current_task_status" : "RUNNING|COMPLETED|FAILED",
--     "current_task_error" : "error message",
--     "total_workflow_tasks" : "2",
--     "task":{
--         "task1" : {
--             "start_time" : "2024-06-12 11:35:27",
--             "end_time" : "2024-06-12 11:35:27",
--             "status" : "RUNNING|COMPLETED|FAILED",
--             "message" : "Validating the uploaded osw file",
--             "error" : "error message",
--             "input" : {
--                 "input1" : "value1",
--                 "input2" : "value2"
--             },
--             "output" : {
--                 "output1" : "value1",
--                 "output2" : "value2"
--             }
--         },
--         "task2" : {
--             "start_time" : "2024-06-12 11:35:27",
--             "end_time" : "2024-06-12 11:35:27",
--             "status" : "RUNNING|COMPLETED|FAILED",
--             "message" : "Validating the uploaded osw file",
--             "error" : "error message",
--             "input" : {
--                 "input1" : "value1",
--                 "input2" : "value2"
--             },
--             "output" : {
--                 "output1" : "value1",
--                 "output2" : "value2"
--             }
--         }
--     }
-- }