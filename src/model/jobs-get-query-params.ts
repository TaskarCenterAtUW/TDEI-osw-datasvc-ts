import { IsEnum, IsOptional } from "class-validator";
import { JoinCondition, PgQueryObject, SqlORder, WhereCondition, buildQuery } from "../database/dynamic-query-object";

export enum TDEIRole {
    "tdei-admin" = "tdei-admin",
    "poc" = "poc",
    "flex_data_generator" = "flex_data_generator",
    "pathways_data_generator" = "pathways_data_generator",
    "osw_data_generator" = "osw_data_generator"
}
export enum TDEIDataType {
    "osw" = "osw",
    "pathways" = "pathways",
    "flex" = "flex"
}

export enum JobStatus {
    "COMPLETED" = "COMPLETED",
    "FAILED" = "FAILED",
    "IN-PROGRESS" = "IN-PROGRESS"
}

export enum JobType {
    "Confidence-Calculate" = "Confidence-Calculate",
    "Dataset-Reformat" = "Dataset-Reformat",
    "Dataset-Upload" = "Dataset-Upload",
    "Dataset-Publish" = "Dataset-Publish",
    "Dataset-Validate" = "Dataset-Validate",
    "Dataset-Flatten" = "Dataset-Flatten",
    "Dataset-Queries" = "Dataset-Queries",
    "Quality-Metric" = "Quality-Metric",
    "Edit-Metadata" = "Edit-Metadata",
    "Clone-Dataset" = "Clone-Dataset"
}
export class JobsQueryParams {
    @IsOptional()
    @IsEnum(JobStatus)
    status: JobStatus | undefined;
    @IsOptional()
    job_id: string | undefined;
    @IsOptional()
    tdei_project_group_id: string | undefined;
    @IsOptional()
    @IsEnum(JobType)
    job_type: JobType | undefined;
    @IsOptional()
    page_no = 1;
    @IsOptional()
    page_size = 10;
    isAdmin = false;

    constructor(init?: Partial<JobsQueryParams>) {
        Object.assign(this, init);
    }

    getQuery(user_id: string): PgQueryObject {
        //Select columns
        const selectColumns = [`content.job.job_id, content.job.job_type, content.job.data_type, content.job.request_input, content.job.response_props,
             content.job.download_url, content.job.tdei_project_group_id, content.job.user_id,
            wfd.created_at,
            wfd.status, wfd.current_task, wfd.current_task_status, wfd.current_task_description,
		    wfd.start_time, wfd.end_time,wfd.current_task_error,wfd.total_workflow_tasks,wfd.tasks_track_number,
            wfd.last_updated_at,
            ue.username as requested_by,pg.name as tdei_project_group_name`];
        //Main table name
        const mainTableName = 'content.job';
        //Joins
        const joins: JoinCondition[] = [
            { tableName: 'keycloak.user_entity', alias: 'ue', on: `content.job.user_id = ue.id`, type: 'LEFT' },
            { tableName: 'public.project_group', alias: 'pg', on: `content.job.tdei_project_group_id = pg.project_group_id`, type: 'LEFT' },
            { tableName: 'content.workflow_details', alias: 'wfd', on: `content.job.job_id = wfd.job_id`, type: 'LEFT' }
        ];

        if (!this.isAdmin) {
            joins.push({ tableName: 'public.user_roles', alias: 'urs', on: `urs.user_id  = '${user_id}'`, type: 'LEFT' });
        }

        //Conditions
        const conditions: WhereCondition[] = [];
        if (!this.isAdmin) {
            conditions.push({ clouse: 'urs.project_group_id = pg.project_group_id', value: null });
            addConditionIfValueExists('urs.project_group_id = ', this.tdei_project_group_id);
        }
        else {
            addConditionIfValueExists('pg.project_group_id = ', this.tdei_project_group_id);
        }
        addConditionIfValueExists('wfd.status = ', this.status);
        addConditionIfValueExists('content.job.job_id = ', this.job_id);
        addConditionIfValueExists('job_type = ', this.job_type);
        conditions.push({ clouse: 'wfd.job_id is not NULL', value: null });

        //Sort field
        const sortField = 'wfd.last_updated_at';
        const sortOrder = SqlORder.DESC;
        //Build the query
        const queryObject = buildQuery(selectColumns, mainTableName, conditions, joins, sortField, sortOrder, this.page_size, this.page_no);

        function addConditionIfValueExists(clouse: string, value: any) {
            if (value) {
                conditions.push({ clouse, value });
            }
        }
        return queryObject;
    }

}