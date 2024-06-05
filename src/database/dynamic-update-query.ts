export function buildUpdateQuery(table: string, data: any, where: Map<string, string>, returnUpdatedRow: boolean = false) {
    const keys = Object.keys(data);
    const values = Object.values(data);
    const setString = keys.map((key, i) => `${key} = $${i + 1}`).join(', ');

    const whereKeys = Array.from(where.keys());
    const whereValues = Array.from(where.values());
    const whereString = whereKeys.map((key, i) => `${key} = $${values.length + i + 1}`).join(' AND ');

    values.push(...whereValues);

    const query = {
        text: `UPDATE ${table} SET ${setString} WHERE ${whereString} ${returnUpdatedRow ? 'RETURNING *' : ''}`,
        values: values,
    };

    return query;
}