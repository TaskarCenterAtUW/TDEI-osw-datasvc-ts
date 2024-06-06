export class QueryCriteria {
    private table: string;
    private data: any;
    private where: Map<string, string>;
    private returnUpdatedRow: boolean;

    constructor() {
        this.table = '';
        this.data = {};
        this.where = new Map();
        this.returnUpdatedRow = false;
    }

    setTable(table: string) {
        this.table = table;
        return this;
    }

    setData(data: any) {
        this.data = data;
        return this;
    }

    setWhere(where: Map<string, string>) {
        this.where = where;
        return this;
    }

    setReturnUpdatedRow(returnUpdatedRow: boolean) {
        this.returnUpdatedRow = returnUpdatedRow;
        return this;
    }

    buildUpdateQuery() {
        if (this.validateInput()) throw new Error('Invalid QueryCriteria input');

        const keys = Object.keys(this.data);
        const values = Object.values(this.data);
        const setString = keys.map((key, i) => `${key} = $${i + 1}`).join(', ');

        let whereString!: string;
        if (this.where.size > 0) {
            const whereKeys = Array.from(this.where.keys());
            const whereValues = Array.from(this.where.values());
            whereString = whereKeys.map((key, i) => `${key} = $${values.length + i + 1}`).join(' AND ');
            values.push(...whereValues);
        }

        const query = {
            text: `UPDATE ${this.table} SET ${setString} ${whereString ? 'WHERE ' + whereString : ''} ${this.returnUpdatedRow ? 'RETURNING *' : ''}`,
            values: values,
        };

        return query;
    }

    private validateInput() {
        return !this.table || !this.data || Object.keys(this.data).length === 0;
    }
}