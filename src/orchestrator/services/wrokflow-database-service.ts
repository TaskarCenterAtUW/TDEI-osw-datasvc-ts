import { QueueMessage } from "nodets-ms-core/lib/core/queue";
import dbClient from "../../database/data-source";
import { QueryConfig } from "pg";


export interface IWorkflowDatabaseService {
    /**
     * Inserts new entry to workflow history table
     * @param message 
     * @returns 
     */
    logWorkflowHistory(workflow_group: string, worflow_stage: string, message: QueueMessage): Promise<boolean>;
    /**
     * Updates the existing workflow response message
     * @param message 
     * @returns 
     */
    updateWorkflowHistory(stage: string, message: QueueMessage): Promise<boolean>;

    /**
     * Deletes any workflow if exists for given parameters
     * @param reference_id 
     * @param workflow_group 
     * @returns 
     */
    obseleteAnyExistingWorkflowHistory(reference_id: string, workflow_group: string): Promise<boolean>;
}

class WorkflowDatabaseService implements IWorkflowDatabaseService {
    constructor() { }

    /**
     * Inserts new entry to workflow history table
     * @param message 
     * @returns 
     */
    async logWorkflowHistory(workflow_group: string, worflow_stage: string, message: QueueMessage): Promise<boolean> {
        try {
            let data = {
                reference_id: message.messageId,
                request_message: message,
                workflow_group: workflow_group,
                worflow_stage: worflow_stage
            }

            const queryObject = {
                text: `INSERT INTO public.osw_workflow_history(
                    reference_id, 
                    workflow_group,
                    workflow_stage,
                    request_message)
                    VALUES ($1, $2, $3, $4)`.replace(/\n/g, ""),
                values: [data.reference_id, data.workflow_group, data.worflow_stage, data.request_message],
            }

            await dbClient.query(queryObject);

            return Promise.resolve(true);
        } catch (error) {
            console.error("Error saving the osw workflow history", error);
            return Promise.reject(false);
        }
    }

    /**
     * Updates the existing workflow response message
     * @param message 
     * @returns 
     */
    async updateWorkflowHistory(stage: string, message: QueueMessage): Promise<boolean> {
        try {
            let data = {
                workflow_stage: stage,
                reference_id: message.messageId,
                response_message: message
            }

            const queryObject = {
                text: `UPDATE public.osw_workflow_history SET
                    response_message=$1, 
                    updated_timestamp= CURRENT_TIMESTAMP 
                    WHERE  reference_id=$2 AND workflow_stage=$3`.replace(/\n/g, ""),
                values: [data.response_message, data.reference_id, data.workflow_stage],
            }

            await dbClient.query(queryObject);

            return Promise.resolve(true);
        } catch (error) {
            console.error("Error updating the osw workflow history", error);
            return Promise.reject(false);
        }
    }

    /**
     * Invalidates any workflow if exists for given parameters
     * @param reference_id 
     * @param workflow_group 
     * @param worflow_stage 
     * @returns 
     */
    async obseleteAnyExistingWorkflowHistory(reference_id: string, workflow_group: string): Promise<boolean> {
        try {
            let data = {
                reference_id: reference_id,
                workflow_group: workflow_group,
            }

            const queryObject = {
                text: `UPDATE public.osw_workflow_history SET
                    obsolete = true 
                    WHERE  reference_id=$1 AND workflow_group=$2`.replace(/\n/g, ""),
                values: [data.reference_id, data.workflow_group],
            }

            await dbClient.query(queryObject);

            return Promise.resolve(true);
        } catch (error) {
            console.error("Error updating the osw workflow history", error);
            return Promise.reject(false);
        }
    }
}

const workflowDatabaseService: IWorkflowDatabaseService = new WorkflowDatabaseService();
export default workflowDatabaseService;