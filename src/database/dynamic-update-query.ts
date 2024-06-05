export function buildUpdateQuery(table: string, data: any, where: any, returnUpdatedRow: boolean = false) {
    const keys = Object.keys(data);
    const values = Object.values(data);
    const setString = keys.map((key, i) => `${key} = $${i + 1}`).join(', ');

    const whereKeys = Object.keys(where);
    const whereValues = Object.values(where);
    const whereString = whereKeys.map((key, i) => `${key} = $${values.length + i + 1}`).join(' AND ');

    values.push(...whereValues);

    const query = {
        text: `UPDATE ${table} SET ${setString} WHERE ${whereString} ${returnUpdatedRow ? 'RETURNING *' : ''}`,
        values: values,
    };

    return query;
}