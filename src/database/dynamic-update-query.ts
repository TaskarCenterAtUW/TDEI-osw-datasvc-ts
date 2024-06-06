export class QueryCriteria {
    private table: string;
    private data: any;
    private where: Map<string, string>;
    private returnUpdatedRow: boolean;

    constructor(table: string, data: any, where: Map<string, string>, returnUpdatedRow: boolean = false) {
        this.table = table;
        this.data = data;
        this.where = where;
        this.returnUpdatedRow = returnUpdatedRow;
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