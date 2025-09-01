import { IsIn, IsNotEmpty, IsOptional, validate, ValidationError } from "class-validator";
import { buildQuery, JoinCondition, PgQueryObject, SqlORder, WhereCondition } from "../database/dynamic-query-object";
import { InputException } from "../exceptions/http/http-exceptions";
import { feedbackRequestParams } from "./feedback-request-params";

export class FeedbackDownloadRequestParams extends feedbackRequestParams {
    @IsNotEmpty()
    override tdei_project_group_id!: string;

    @IsOptional()
    override page_no?: number;

    @IsOptional()
    override page_size?: number;

    @IsOptional()
    @IsIn(['csv', 'geojson'], { message: 'format must be csv or geojson' })
    format: string = 'csv';

    @IsOptional()
    @IsIn(['created_at', 'due_date'], { message: "due_date must be either 'created_at' or 'due_date'" })
    due_date?: 'created_at' | 'due_date';

    constructor(init?: Partial<FeedbackDownloadRequestParams>) {
        super();
        Object.assign(this, init);
        if (init?.page_no === undefined) this.page_no = undefined;
        if (init?.page_size === undefined) this.page_size = undefined;
        if (init?.due_date !== undefined && init?.sort_by === undefined) {
            this.sort_by = init.due_date;
        }
    }

    async validateRequestInput() {
        const errors = await validate(this, { whitelist: true, forbidNonWhitelisted: true });
        if (errors.length > 0) {
            console.log('Input validation failed');
            const message = errors
                .map((error: ValidationError) => Object.values(error.constraints as Record<string, string>))
                .join(', ');
            throw new InputException(`Required fields are missing or invalid: ${message}`);
        }
        return true;
    }

    override getQuery(user_id: string): PgQueryObject {
        const selectColumns = [
            "pg.project_group_id as tdei_project_group_id",
            "pg.name as project_group_name",
            "fd.tdei_dataset_id",
            "ds.name as dataset_name",
            "fd.id",
            "fd.feedback_text",
            "fd.created_at",
            "fd.updated_at",
            "fd.due_date",
            "fd.dataset_element_id",
            "fd.status",
            "fd.location_latitude",
            "fd.location_longitude",
            "fd.customer_email"
        ];

        const mainTableName = "content.feedback fd";

        const joins: JoinCondition[] = [
            { tableName: "public.project_group", alias: "pg", on: "fd.tdei_project_id = pg.project_group_id", type: "LEFT" },
            { tableName: "content.dataset", alias: "ds", on: "fd.tdei_dataset_id = ds.tdei_dataset_id", type: "LEFT" }
        ];

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

        const sortField = this.sort_by === "due_date" ? "fd.due_date" : "fd.created_at";
        const sortOrder = this.sort_order ?? SqlORder.DESC;

        const excludeLimit = this.page_no === undefined && this.page_size === undefined;
        const pageSize = this.page_size ?? 10;
        const pageNo = this.page_no ?? 1;

        return buildQuery(
            selectColumns,
            mainTableName,
            conditions,
            joins,
            sortField,
            sortOrder,
            pageSize,
            pageNo,
            excludeLimit
        );
    }
}

