import { IsEnum, IsOptional } from "class-validator";
import { JoinCondition, PgQueryObject, SqlORder, WhereCondition, buildQuery } from "../database/dynamic-query-object";

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
    "Dataset-Queries" = "Dataset-Queries"
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
        const selectColumns = ['content.job.*, ue.username as requested_by,pg.name as tdei_project_group_name'];
        //Main table name
        const mainTableName = 'content.job';
        //Joins
        const joins: JoinCondition[] = [
            { tableName: 'keycloak.user_entity', alias: 'ue', on: `content.job.user_id = ue.id AND ue.id = '${user_id}'`, type: 'LEFT' },
            { tableName: 'public.project_group', alias: 'pg', on: `content.job.tdei_project_group_id = pg.project_group_id`, type: 'LEFT' }
        ];
        //Conditions
        const conditions: WhereCondition[] = [];
        if (!this.isAdmin) {
            addConditionIfValueExists('content.job.user_id = ', user_id);
        }
        addConditionIfValueExists('status = ', this.status);
        addConditionIfValueExists('job_id = ', this.job_id);
        addConditionIfValueExists('job_type = ', this.job_type);
        addConditionIfValueExists('tdei_project_group_id = ', this.tdei_project_group_id);

        //Sort field
        const sortField = 'updated_at';
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