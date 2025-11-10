import { IsIn, IsISO8601, IsOptional, validate, ValidationError } from "class-validator";
import { buildQuery, JoinCondition, PgQueryObject, SqlORder, WhereCondition } from "../database/dynamic-query-object";
import { InputException } from "../exceptions/http/http-exceptions";

export class feedbackRequestParams {
    /** ID of the project group. */
    @IsOptional()
    tdei_project_group_id!: string;

    @IsOptional()
    @IsIn(['open', 'resolved'], {
        message: "status must be either 'open' or 'resolved'",
    })
    status?: string;

    /** ID of the dataset. */
    @IsOptional()
    tdei_dataset_id!: string;

    /** Date in ISO 8601 format, filters feedbacks created after this date. */
    @IsOptional()
    @IsISO8601()
    from_date?: string;

    /** Date in ISO 8601 format, filters feedbacks created before this date. */
    @IsOptional()
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

    async validateRequestInput() {
        let errors = await validate(this);
        if (errors.length > 0) {
            console.log('Input validation failed');
            let message = errors.map((error: ValidationError) => Object.values(<any>error.constraints)).join(', ');
            throw new InputException(`Required fields are missing or invalid: ${message}`);
        }
        return true;
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
            "fd.id",
            "fd.feedback_text",
            "fd.created_at",
            "fd.updated_at",
            "fd.due_date",
            "fd.dataset_element_id",
            "fd.status",
            "fd.location_latitude",
            "fd.location_longitude",
            "fd.customer_email",
            "fd.resolution_status",
            "fd.resolution_description",
            "ue.username as resolved_by"
        ];

        // Main table name
        const mainTableName = "content.feedback fd";

        // Joins
        const joins: JoinCondition[] = [
            { tableName: "public.project_group", alias: "pg", on: "fd.tdei_project_id = pg.project_group_id", type: "LEFT" },
            { tableName: "content.dataset", alias: "ds", on: "fd.tdei_dataset_id = ds.tdei_dataset_id", type: "LEFT" },
            { tableName: "keycloak.user_entity", alias: "ue", on: "fd.resolved_by = ue.id", type: "LEFT" },
        ];

        // Conditions
        const conditions: WhereCondition[] = [];

        if (this.tdei_project_group_id) {
            conditions.push({ clouse: "fd.tdei_project_id = ", value: this.tdei_project_group_id });
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
        if (this.status) {
            conditions.push({ clouse: "fd.status = ", value: this.status.toLocaleLowerCase() });
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