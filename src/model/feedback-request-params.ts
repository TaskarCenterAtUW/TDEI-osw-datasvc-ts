import { IsEnum, IsIn, IsISO8601, IsOptional } from "class-validator";
import { buildQuery, JoinCondition, PgQueryObject, SqlORder, WhereCondition } from "../database/dynamic-query-object";

export class feedbackRequestParams {
    /** ID of the project group. */
    @IsOptional()
    project_id!: string;

    /** ID of the dataset. */
    @IsOptional()
    tdei_dataset_id!: string;

    /** Date in ISO 8601 format, filters feedbacks created after this date. */
    @IsISO8601()
    from_date?: string;

    /** Date in ISO 8601 format, filters feedbacks created before this date. */
    @IsISO8601()
    to_date?: string;

    /** Sorts feedbacks by the specified field. Defaults to 'created_at'. */
    @IsOptional()
    //is one of 'created_at' | 'due_date'
    @IsIn(['created_at', 'due_date'], {
        message: "sort must be either 'created_at' or 'due_date'",
    })
    sort_by?: 'created_at' | 'due_date' = 'due_date';

    /** Sorts feedbacks in ascending or descending order. Defaults to 'desc'. */
    @IsOptional()
    @IsIn(['asc', 'desc', 'ASC', 'DESC'], {
        message: "sort_order must be either 'asc' or 'desc'",
    })
    sort_order?: SqlORder = SqlORder.DESC;

    /** Filters feedbacks by retrieving results in pages. Defaults to 1. */
    @IsOptional()
    page_no?: number = 1;

    /** Specifies total records per page. Between 1 to 50, defaults to 10. */
    @IsOptional()
    page_size?: number = 10;

    constructor(init?: Partial<feedbackRequestParams>) {
        Object.assign(this, init);
    }

    getQuery(user_id: string): PgQueryObject {
        // Select only required columns for Feedback response
        const selectColumns = [
            // Project group info
            "pg.project_group_id as tdei_project_group_id",
            "pg.name as project_group_name",
            // Dataset info
            "fd.tdei_dataset_id",
            "ds.name as dataset_name",
            // Feedback info
            "fd.feedback_text",
            "fd.created_at",
            "fd.due_date",
            "fd.dataset_element_id",
            "fd.status",
            "fd.location_latitude",
            "fd.location_longitude",
            "fd.customer_email",
            // Metadata (example: count, overdue, open)
            "COUNT(fd.id) OVER() as count",
            "SUM(CASE WHEN fd.due_date < NOW() AND fd.status = 'open' THEN 1 ELSE 0 END) OVER() as overdue",
            "SUM(CASE WHEN fd.status = 'open' THEN 1 ELSE 0 END) OVER() as open"
        ];

        // Main table name
        const mainTableName = "content.feedback fd";

        // Joins
        const joins: JoinCondition[] = [
            { tableName: "public.project_group", alias: "pg", on: "fd.tdei_project_id = pg.project_group_id", type: "LEFT" },
            { tableName: "content.dataset", alias: "ds", on: "fd.tdei_dataset_id = ds.tdei_dataset_id", type: "LEFT" }
        ];

        // Conditions
        const conditions: WhereCondition[] = [];

        if (this.project_id) {
            conditions.push({ clouse: "fd.tdei_project_id = ", value: this.project_id });
        }
        if (this.tdei_dataset_id) {
            conditions.push({ clouse: "fd.tdei_dataset_id = ", value: this.tdei_dataset_id });
        }
        if (this.from_date) {
            conditions.push({ clouse: "fd.created_at >= ", value: this.from_date });
        }
        if (this.to_date) {
            conditions.push({ clouse: "fd.created_at <= ", value: this.to_date });
        }

        // Sorting
        const sortField = this.sort_by === "due_date" ? "fd.due_date" : "fd.created_at";
        const sortOrder = this.sort_order ?? SqlORder.DESC;

        // Pagination
        const pageSize = this.page_size ?? 10;
        const pageNo = this.page_no ?? 1;

        // Build the query
        return buildQuery(selectColumns, mainTableName, conditions, joins, sortField, sortOrder, pageSize, pageNo);
    }
}