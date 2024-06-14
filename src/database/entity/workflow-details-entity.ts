import { IsNotEmpty } from 'class-validator';
import { Prop } from 'nodets-ms-core/lib/models';
import { BaseDto } from '../../model/base-dto';
import { TdeiDate } from '../../utility/tdei-date';
import dbClient from '../data-source';
import { WorkflowContext } from '../../orchestrator_v2/workflow/workflow-context.model';

export class WorkflowDetailsEntity extends BaseDto {
    [key: string]: any;//This is to allow dynamic properties
    @Prop()
    @IsNotEmpty()
    execution_id!: string;
    @Prop()
    @IsNotEmpty()
    job_id!: string;
    @Prop()
    @IsNotEmpty()
    workflow_name!: string;
    @Prop()
    @IsNotEmpty()
    workflow_context!: WorkflowContext;
    @Prop()
    @IsNotEmpty()
    status!: string;
    @Prop()
    @IsNotEmpty()
    triggered_by!: string;
    @Prop()
    created_at!: string;
    @Prop()
    updated_at!: string;

    /**
     * Creates a new instance of the WorkflowDetailsEntity class.
     * @param init - The initial values of the instance.
     */
    static async getWorkflowByExecutionId(execution_id: string): Promise<WorkflowDetailsEntity | null> {
        const queryObject = {
            text: `Select * from content.workflow_details where execution_id = $1`,
            values: [execution_id]
        }

        let result = await dbClient.query(queryObject);

        if (result.rows.length == 0) return Promise.resolve(null);

        let entity = WorkflowDetailsEntity.from(result.rows[0]);
        entity.workflow_context = WorkflowContext.from(entity.workflow_context);

        return entity;
    }

    /**
     * Saves the workflow details to the database.
     * @param workflow - The workflow details to save.
     * @returns A Promise that resolves to void.
     * @throws An error if the workflow details cannot be saved.
     */
    static async saveWorkflow(workflow: WorkflowDetailsEntity): Promise<void> {
        const queryObject = {
            text: `INSERT INTO content.workflow_details(
                job_id, 
                workflow_name,
                workflow_context,
                status,
                triggered_by,
                created_at,
                updated_at)
                VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
            values: [workflow.job_id, workflow.workflow_name, workflow.workflow_context,
            workflow.status, workflow.triggered_by, TdeiDate.UTC(), TdeiDate.UTC()]
        }

        let result = await dbClient.query(queryObject);
        workflow.execution_id = result.rows[0].execution_id;
    }

    static async saveWorkflowContext(workflow_execution_id: string, context: WorkflowContext): Promise<void> {
        const queryObject = {
            text: `UPDATE content.workflow_details SET workflow_context = $1 WHERE execution_id = $2`,
            values: [context, workflow_execution_id]
        }

        await dbClient.query(queryObject);
    }

    /**
     * Retrieves the workflow context for a given workflow execution ID.
     * @param workflow_execution_id - The workflow execution ID.
     * @returns A Promise that resolves to the workflow context.
     * @throws An error if the workflow context is not found.
     */
    static async getWorkflowContext(workflow_execution_id: string): Promise<WorkflowContext | null> {
        const queryObject = {
            text: `Select workflow_context from content.workflow_details where execution_id = $1`,
            values: [workflow_execution_id]
        }

        let result = await dbClient.query(queryObject);

        if (result.rows.length == 0) return Promise.resolve(null);

        return WorkflowContext.from(result.rows[0].workflow_context);
    }
}