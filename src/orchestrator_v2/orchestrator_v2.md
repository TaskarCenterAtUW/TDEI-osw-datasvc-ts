### General Workflow Structure and Adding a New Workflow

#### General Workflow Structure

1. **Workflow Definition**:
   - **Name**: The identifier for the workflow.
   - **Description**: A brief description of what the workflow does.
   - **Workflow Input**: Parameters required for the workflow, such as IDs, URLs, and metadata.

2. **Tasks**:
   - **Task Types**: Various types include `Event`, `Utility`, and `Exception`.
     - **Event**: Interacts with external services via event-driven communication.
     - **Utility**: Executes internal functions or database operations.
     - **Exception**: Handles failure scenarios and clean-up actions.
   - **Task Attributes**:
     - **Name**: The identifier for the task.
     - **Task Reference Name**: A unique reference name for the task.
     - **Description**: A brief description of the task’s purpose.
     - **Type**: Specifies the type of task (Event, Utility, Exception).
     - **Input Parameters**: Parameters required by the task.
     - **Output Parameters**: Expected output from the task.
     - **Function**: Specifies the function to be executed (for Utility tasks).
     - **Event Topic**: For event-driven tasks, the topic on which to publish or subscribe.

3. **Exception Handling**:
   - Defines tasks that are executed in case of workflow failure.
   - Ensures proper cleanup and logging of failure details.

4. **Subscriptions**:
   - Event topics that the workflow subscribes to for receiving responses from external services.
   - Managed by a subscription handler that listens to specific topics and triggers corresponding actions.

#### Predefined Utility Tasks

Some generic utility tasks are predefined and can be reused across multiple workflows. Examples include `update_table`, `get_blob_folder_path_wo_ext`, and others. These tasks perform common operations such as database updates, path retrievals, etc.

#### Adding a New Workflow

To add a new workflow, follow these steps:

1. **Define the Workflow**:
   - Create a new workflow entry in your configuration with a unique name and description.

2. **Specify Workflow Inputs**:
   - Define the required input parameters for your workflow.

3. **Define Tasks**:
   - List the tasks in the order they need to be executed.
   - For each task, specify:
     - Name and reference name.
     - Description.
     - Type (Event, Utility, Exception).
     - Input parameters required by the task.
     - Output parameters expected from the task.
     - Function (if it’s a Utility task).
     - Event topic (for Event tasks).

4. **Exception Tasks**:
   - Define tasks to handle any exceptions or failures that might occur during the workflow.
   - Ensure these tasks handle cleanup and logging appropriately.

5. **Subscriptions**:
   - List the event topics your workflow will subscribe to.
   - Define the handler for these subscriptions.

### Example of Adding a New Workflow

Here’s an example configuration for a new workflow:

```json
{
    "workflows": [
        {
            "name": "new_workflow",
            "description": "Workflow for new process",
            "workflow_input": {
                "input_param1": "<%=input_param1%>",
                "input_param2": "<%=input_param2%>"
            },
            "tasks": [
                {
                    "name": "task1",
                    "task_reference_name": "task1_ref",
                    "description": "Description of task 1",
                    "type": "Event",
                    "topic": "task1-request",
                    "input_params": {
                        "param1": "<%=workflow_input.input_param1%>",
                        "param2": "<%=workflow_input.input_param2%>"
                    },
                    "output_params": {
                        "success": "<%=data.success%>",
                        "message": "<%=data.message%>"
                    }
                },
                {
                    "name": "task2",
                    "task_reference_name": "task2_ref",
                    "description": "Description of task 2",
                    "type": "Utility",
                    "input_params": {
                        "param1": "<%=workflow_input.input_param1%>",
                        "param2": "<%=workflow_input.input_param2%>"
                    },
                    "output_params": {
                        "success": "<%=success%>",
                        "message": "<%=message%>",
                        "result": "<%result%>"
                    },
                    "function": "perform_task2"
                }
            ],
            "exception_task": [
                {
                    "name": "task_failure",
                    "task_reference_name": "task_failure_ref",
                    "description": "Handle task failure",
                    "type": "Exception",
                    "input_params": {
                        "error": "<%=error%>"
                    },
                    "output_params": {
                        "success": "<%=success%>",
                        "message": "<%=message%>"
                    },
                    "function": "handle_failure"
                }
            ]
        }
    ],
    "subscriptions": [
        {
            "description": "Subscription for task1 response",
            "topic": "task1-response",
            "subscription": "res-handler"
        }
    ]
}
```

### Steps for Adding the Workflow:
1. **Define the workflow** with a name (`new_workflow`) and description.
2. **Specify the workflow input parameters** (`input_param1`, `input_param2`).
3. **Define the tasks**:
   - `task1` is an Event type task that sends a request to the `task1-request` topic.
   - `task2` is a Utility type task that performs a function `perform_task2`.
4. **Specify exception handling tasks** to manage failures.
5. **Define subscriptions** for listening to responses (`task1-response`).

### Writing Functions for Specific Logic

For tasks that require specific or custom logic, functions should be defined in `task-functions.ts`. Here are the conventions to follow:

#### Example Function Definition

In `task-functions.ts`:

```typescript
/**
 * Function to perform a specific task
 * @param input - The input parameters for the function
 * @returns - The output result of the function
 */
export function perform_task2(input: any): Promise<any> {
    try
    {
    // Function logic here
        let result = input.param1 + input.param2;
        return Promise.resolve({
                success: true,
                message: "Task performed successfully",
                result : result
        });
    }
    catch(error)
    {
         console.error("Error while performing the task", e);
            return Promise.resolve({
                success: false,
                message: "Error while performing the task"
            });
    }
}
```

### Function Conventions
1. **Input and Output**:
   - Define the input parameters and return type clearly.
2. **Documentation**:
   - Add JSDoc comments to describe the function’s purpose, parameters, and return values.
3. **Logic Implementation**:
   - Implement the specific logic needed for the task.
   - Ensure the function returns the expected output format.

By following these steps and conventions, new workflows can be added and custom logic can be implemented effectively, ensuring consistency and maintainability across the workflow system.