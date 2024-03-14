
export interface PgQueryObject {
    text: string;
    values: any[];
}

export interface JoinCondition {
    tableName: string;
    alias: string;
    on: string;
    type?: "INNER" | "LEFT" | "RIGHT" | "FULL";
}

export interface WhereCondition {
    clouse: string;
    value?: any;
}

// Define a function to build dynamic PostgreSQL queries with inner joins, sorting, and pagination
export function buildQuery(
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
        conditions.forEach((condition, index) => {
            if (index > 0) {
                whereClause += ' AND ';
            }
            if (condition.value) {
                whereClause += `${condition.clouse}  $${index + 1}`;
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

    if (limit == undefined || limit < 1)
        limit = 1;
    if (offset == undefined)
        offset = 10;
    offset = limit == 1 ? 0 : (limit - 1) * offset;
    limit = offset > 50 ? 50 : offset;

    let limitClause = '';
    if (limit !== undefined && limit !== null) {
        limitClause = ` LIMIT ${limit}`;
    }

    let offsetClause = '';
    if (offset !== undefined && offset !== null) {
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


export enum SqlORder {
    ASC = "ASC", DESC = "DESC"
}

export class DynamicQueryObject {
    private _select!: string;
    private _limit = "";
    private _offset = "";
    private _order = "";
    private values: any[] = [];
    paramCouter = 1;

    private conditions: string[] = [];

    /**
    * Push the conditions with placeholder & value. Placeholder counter should be 'paramCouter' of the DynamicQueryObject object.
    */
    condition(clouse: string, value: any) {
        this.conditions.push(clouse);
        if (value == null) return;
        if (value instanceof Array) {
            value.forEach(element => {
                this.values.push(element);
            });
        }
        else {
            this.values.push(value);
        }
    }

    buildSelect(tableName: string, columns: string[]) {
        this._select = `SELECT ${columns.join(',')} FROM ${tableName} `;
    }

    buildInnerJoin(sourceTableName: string, destinationTableName: string, sourceJoinColumn: string, destJoinColumn: string) {
        this._select += ` INNER JOIN ${destinationTableName} on ${destinationTableName}.${destJoinColumn} = ${sourceTableName}.${sourceJoinColumn} `;
    }

    private buildWhere() {
        if (this.conditions.length == 0) return "";
        return ` WHERE ${this.conditions.join(" AND ")}`;
    }
    buildOrder(column: string, order: SqlORder) {
        this._order = ` ORDER BY ${column} ${order.toString()} `;
    }
    buildPagination(page_no: number, page_size: number) {
        //Set defaults if not provided
        if (page_no == undefined || page_no < 1)
            page_no = 1;
        if (page_size == undefined)
            page_size = 10;
        const skip = page_no == 1 ? 0 : (page_no - 1) * page_size;
        const take = page_size > 50 ? 50 : page_size;

        this._limit = ` LIMIT $${this.paramCouter++}`;
        this.values.push(take);
        this._offset = ` OFFSET $${this.paramCouter++} `;
        this.values.push(skip);
    }

    getQuery() {
        return this._select.concat(this.buildWhere()).concat(this._order).concat(this._limit).concat(this._offset);
    }

    getValues() {
        return this.values;
    }
}