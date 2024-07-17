import { IsEnum, IsOptional } from "class-validator";
import { JoinCondition, PgQueryObject, SqlORder, WhereCondition, buildQuery } from "../database/dynamic-query-object";
import { InputException } from "../exceptions/http/http-exceptions";

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
    @IsOptional()
    show_group_jobs = false;
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
            { tableName: 'content.workflow_details', alias: 'wfd', on: `content.job.job_id = wfd.job_id`, type: 'LEFT' }
        ];
        //Conditional Join
        if (!this.isAdmin) {
            joins.push({
                tableName: `( SELECT DISTINCT ur.project_group_id, ur.user_id 
                FROM public.user_roles AS ur 
                WHERE ur.project_group_id in (
                     SELECT DISTINCT ur.project_group_id 
                   FROM public.user_roles AS ur 
                   WHERE ur.user_id = '${user_id}' 
                )  
              )`.replace(/\n/g, ""), alias: 'ur', on: `CONTENT.job.user_id = ur.user_id`, type: 'LEFT'
            });
            joins.push({
                tableName: 'public.project_group', alias: 'pg', on: `ur.project_group_id = pg.project_group_id`, type: 'LEFT'
            });
        }
        else {
            //Admin
            joins.push({
                tableName: 'public.project_group', alias: 'pg', on: `content.job.tdei_project_group_id = pg.project_group_id`, type: 'LEFT'
            });
        }

        //Conditions
        const conditions: WhereCondition[] = [
            { clouse: 'wfd.job_id is not NULL', value: null }
        ];

        //Conditional where clauses
        if (!this.isAdmin) {
            conditions.push({ clouse: 'ur.project_group_id = pg.project_group_id', value: null });
            //Required param if non-admin user else result will produce duplicate rows
            if (!this.tdei_project_group_id) throw new InputException('tdei_project_group_id is required for non-admin user');
            addConditionIfValueExists('ur.project_group_id = ', this.tdei_project_group_id);
        }
        else {
            addConditionIfValueExists('pg.project_group_id = ', this.tdei_project_group_id);
        }

        if (!this.show_group_jobs) {
            //Default show only user's jobs
            addConditionIfValueExists('content.job.user_id = ', user_id);
        }
        addConditionIfValueExists('wfd.status = ', this.status);
        addConditionIfValueExists('content.job.job_id = ', this.job_id);
        addConditionIfValueExists('job_type = ', this.job_type);

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