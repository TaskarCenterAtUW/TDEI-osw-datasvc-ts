import { QueueMessage } from "nodets-ms-core/lib/core/queue";
import dbClient from "../../database/data-source";
import { WorkflowHistoryEntity } from "../../database/entity/workflow-history-entity";


export interface IWorkflowDatabaseService {
    /**
    * Updates the existing workflow request message
    * @param message 
    * @returns 
    */
    updateWorkflowRequest(stage: string, message: QueueMessage): Promise<boolean>;
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

    /**
     * Get the latest publish workflow hostory
     * @param reference_id 
     * @returns 
     */
    getLatestWorkflowHistory(reference_id: string, workflow_group: string): Promise<WorkflowHistoryEntity | undefined>;
}

class WorkflowDatabaseService implements IWorkflowDatabaseService {
    constructor() { }

    /**
     * Inserts new entry to workflow history table
     * @param message 
     * @returns 
     */
    async logWorkflowHistory(workflow_group: string, workflow_stage: string, message: QueueMessage): Promise<boolean> {
        try {
            let data = {
                reference_id: message.messageId,
                request_message: message,
                workflow_group: workflow_group,
                workflow_stage: workflow_stage
            }

            const querySelectObject = {
                text: `SELECT history_id FROM content.workflow_history WHERE 
                reference_id=$1 AND workflow_group=$2 AND workflow_stage=$3 AND obsolete is not true`.replace(/\n/g, ""),
                values: [data.reference_id, data.workflow_group, data.workflow_stage],
            }
            let entry = await dbClient.query(querySelectObject);
            if (entry.rowCount == 0) {
                const queryObject = {
                    text: `INSERT INTO content.workflow_history(
                        reference_id, 
                        workflow_group,
                        workflow_stage,
                        request_message)
                        VALUES ($1, $2, $3, $4)`.replace(/\n/g, ""),
                    values: [data.reference_id, data.workflow_group, data.workflow_stage, data.request_message],
                }

                await dbClient.query(queryObject);
            }
            else {
                //This is the case where queue message self retries 
                const queryObject = {
                    text: `UPDATE content.workflow_history SET
                            request_message=$1
                        WHERE  history_id=$2`.replace(/\n/g, ""),
                    values: [data.request_message, entry.rows[0].history_id],
                }

                await dbClient.query(queryObject);
            }

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
                text: `UPDATE content.workflow_history SET
                    response_message=$1, 
                    updated_timestamp= CURRENT_TIMESTAMP 
                    WHERE  reference_id=$2 AND workflow_stage=$3 AND obsolete is not true`.replace(/\n/g, ""),
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
    * Updates the existing workflow request message
    * @param message 
    * @returns 
    */
    async updateWorkflowRequest(stage: string, message: QueueMessage): Promise<boolean> {
        try {
            let data = {
                workflow_stage: stage,
                reference_id: message.messageId,
                response_message: message
            }

            const queryObject = {
                text: `UPDATE content.workflow_history SET
                    request_message=$1, 
                    updated_timestamp= CURRENT_TIMESTAMP 
                    WHERE  reference_id=$2 AND workflow_stage=$3 AND obsolete is not true`.replace(/\n/g, ""),
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
                text: `UPDATE content.workflow_history SET
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
    /**
     * Get the latest publish workflow hostory
     * @param reference_id 
     * @returns 
     */
    async getLatestWorkflowHistory(reference_id: string, workflow_group: string): Promise<WorkflowHistoryEntity | undefined> {
        try {
            const queryObject = {
                text: `SELECT * FROM content.workflow_history 
                    WHERE  reference_id=$1 AND workflow_group=$2 AND obsolete is not true ORDER BY history_id DESC LIMIT 1`.replace(/\n/g, ""),
                values: [reference_id, workflow_group],
            }

            let result = await dbClient.query(queryObject);
            if (result.rowCount == 0) {
                return Promise.resolve(undefined);
            } else {
                return Promise.resolve(new WorkflowHistoryEntity(result.rows[0]));
            }
        } catch (error) {
            console.error("Error updating the osw workflow history", error);
            return Promise.resolve(undefined);
        }
    }
}

const workflowDatabaseService: IWorkflowDatabaseService = new WorkflowDatabaseService();
export default workflowDatabaseService;