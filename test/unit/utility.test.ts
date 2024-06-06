import { QueryCriteria } from "../../src/database/dynamic-update-query";

describe('buildUpdateQuery', () => {
    it('should build an update query with set and where clauses', () => {
        // Arrange
        const table = 'users';
        const data = {
            name: 'John',
            age: 30,
        };
        const where = new Map<string, string>([
            ['id', '123'],
        ]);

        // Act
        const criteria = new QueryCriteria(table, data, where);
        const query = criteria.buildUpdateQuery();

        // Assert
        expect(query.text.trim()).toBe('UPDATE users SET name = $1, age = $2 WHERE id = $3');
        expect(query.values).toEqual(['John', 30, '123']);
    });

    it('should build an update query without a where clause', () => {
        // Arrange
        const table = 'users';
        const data = {
            name: 'John',
            age: 30,
        };
        const where = new Map<string, string>();

        // Act
        const criteria = new QueryCriteria(table, data, where);
        const query = criteria.buildUpdateQuery();

        // Assert
        expect(query.text.trim()).toBe('UPDATE users SET name = $1, age = $2');
        expect(query.values).toEqual(['John', 30]);
    });

    it('should throw error if no update fields provided', () => {
        // Arrange
        const table = 'users';
        const data = {};
        const where = new Map<string, string>();

        // Act
        const criteria = new QueryCriteria(table, data, where);

        // Assert
        expect(() => criteria.buildUpdateQuery()).toThrow('Invalid QueryCriteria input');
    });
});