import { QueueMessage } from "nodets-ms-core/lib/core/queue";
import dbClient from "../../database/data-source";
import { QueryConfig } from "pg";


export interface IWorkflowDatabaseService {
    /**
     * Inserts new entry to workflow history table
     * @param message 
     * @returns 
     */
    logWorkflowHistory(message: QueueMessage): Promise<boolean>;
    /**
     * Updates the existing workflow response message
     * @param message 
     * @returns 
     */
    updateWorkflowHistory(message: QueueMessage): Promise<boolean>;
}

class WorkflowDatabaseService {
    constructor() { }

    /**
     * Inserts new entry to workflow history table
     * @param message 
     * @returns 
     */
    async logWorkflowHistory(message: QueueMessage): Promise<boolean> {
        try {
            let data = {
                workflow_name: message.messageType,
                tdei_record_id: message.messageId,
                request_message: message
            }

            const queryObject = {
                text: `INSERT INTO public.osw_workflow_history(
                    tdei_record_id, 
                    workflow_name, 
                    request_message)
                    VALUES (?, ?, ?)`.replace(/\n/g, ""),
                values: [data.tdei_record_id, data.workflow_name, data.request_message],
            }

            await dbClient.query(queryObject);

            return Promise.resolve(true);
        } catch (error) {
            console.error("Error saving the osw version", error);
            return Promise.reject(false);
        }
    }

    /**
     * Updates the existing workflow response message
     * @param message 
     * @returns 
     */
    async updateWorkflowHistory(message: QueueMessage): Promise<boolean> {
        try {
            let data = {
                workflow_name: message.messageType,
                tdei_record_id: message.messageId,
                response_message: message
            }

            const queryObject = {
                text: `UPDATE public.osw_workflow_history SET
                    response_message=$1, 
                    updated_timestamp= CURRENT_TIMESTAMP) 
                    WHERE  tdei_record_id=$2 AND workflow_name=$3`.replace(/\n/g, ""),
                values: [data.response_message, data.tdei_record_id, data.workflow_name],
            }

            await dbClient.query(queryObject);

            return Promise.resolve(true);
        } catch (error) {
            console.error("Error saving the osw version", error);
            return Promise.reject(false);
        }
    }
}

const workflowDatabaseService: IWorkflowDatabaseService = new WorkflowDatabaseService();
export default workflowDatabaseService;