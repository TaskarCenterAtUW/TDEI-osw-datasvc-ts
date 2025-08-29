import { IsNotEmpty, IsOptional } from "class-validator";
import { JoinCondition, PgQueryObject, SqlORder, WhereCondition } from "../database/dynamic-query-object";
import { feedbackRequestParams } from "./feedback-request-params";

export class FeedbackDownloadRequestParams extends feedbackRequestParams {
    @IsNotEmpty()
    override tdei_project_group_id!: string;

    @IsOptional()
    override page_no?: number;

    @IsOptional()
    override page_size?: number;

    constructor(init?: Partial<FeedbackDownloadRequestParams>) {
        super();
        Object.assign(this, init);
        if (init?.page_no === undefined) this.page_no = undefined;
        if (init?.page_size === undefined) this.page_size = undefined;
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

        return this.buildQuery(
            selectColumns,
            mainTableName,
            conditions,
            joins,
            sortField,
            sortOrder,
            excludeLimit ? undefined : pageSize,
            excludeLimit ? undefined : pageNo
        );
    }

    private buildQuery(
        selectColumns: string[],
        mainTableName: string,
        conditions: WhereCondition[],
        joins: JoinCondition[],
        sortField?: string,
        sortOrder?: 'ASC' | 'DESC',
        limit?: number,
        offset?: number
    ): PgQueryObject {
        const whereClauseValues: any[] = [];
        let whereClause = '';

        if (conditions.length > 0) {
            whereClause = ' WHERE ';
            let paramIndex = 1;
            conditions.forEach((condition, index) => {
                if (index > 0) {
                    whereClause += ' AND ';
                }
                if (condition.value) {
                    whereClause += `${condition.clouse} $${paramIndex++}`;
                    whereClauseValues.push(condition.value);
                }
                else {
                    whereClause += `${condition.clouse}`;
                }
            });
        }

        let joinClause = '';
        joins.forEach((join, index) => {
            if (join.type) {
                joinClause += ` ${join.type} JOIN ${join.tableName} AS ${join.alias} ON ${join.on}`;
            }
            else {
                joinClause += ` INNER JOIN ${join.tableName} AS ${join.alias} ON ${join.on}`;
            }

            if (index !== joins.length - 1) {
                joinClause += ' ';
            }
        });

        let sortClause = '';
        if (sortField && sortOrder) {
            sortClause = ` ORDER BY ${sortField} ${sortOrder}`;
        }

        let limitClause = '';
        let offsetClause = '';

        if (limit !== undefined && offset !== undefined) {
            limit = Number(limit);
            offset = Number(offset);

            if (limit === undefined || limit < 1) {
                limit = 10;
            }

            if (offset === undefined || offset <= 0) {
                offset = 0;
            } else {
                offset = (offset - 1) * limit;
            }

            if (limit > 50) {
                limit = 50;
            }

            limitClause = ` LIMIT ${limit}`;
            offsetClause = ` OFFSET ${offset}`;
        }

        let selectClause = '';
        if (selectColumns.length > 0) {
            selectClause = `SELECT ${selectColumns.join(', ')} `;
        } else {
            selectClause = 'SELECT * ';
        }

        const queryText = `${selectClause} FROM ${mainTableName}${joinClause}${whereClause}${sortClause}${limitClause}${offsetClause};`;

        return { text: queryText, values: whereClauseValues };
    }
}
