import { QueryCriteria } from "../../src/database/dynamic-update-query";
import { Utility } from "../../src/utility/utility"
import { validateSqlExpression } from "../../src/utility/sql-validation";
import { InputException } from "../../src/exceptions/http/http-exceptions";
import AdmZip from 'adm-zip';
import { Express } from 'express';

describe('checkForSqlInjection', () => {
    it('allows valid spatial join SQL fragments', () => {
        expect(() => Utility.checkForSqlInjection({
            join_condition: 'ST_Contains(geometry_target, geometry_source)',
            join_filter_target: 'highway = \'primary\'',
            join_filter_source: 'surface IS NOT NULL',
            aggregate: ['array_agg(highway) as highways'],
        })).not.toThrow();
    });

    it('allows full SELECT join_condition with CTEs and trailing semicolon', () => {
        expect(() => Utility.checkForSqlInjection({
            join_condition: `WITH candidates AS (
  SELECT s.id AS line_id, p.id AS pole_id
  FROM sidewalks s
  JOIN poles p ON ST_DWithin(s.geom, p.geom, 2)
  WHERE (p.tags->>'amenity') = 'light_pole'
)
SELECT * FROM candidates;`,
            aggregate: ['ARRAY_AGG(ext:unit_id) as SDOT_pole_unit_id'],
        })).not.toThrow();
    });

    it('allows the SDOT pole spatial join payload', () => {
        expect(() => Utility.checkForSqlInjection({
            target_dataset_id: '52945d79-a0df-4440-8363-73bea8e1882a',
            target_dimension: 'edge',
            source_dataset_id: 'fbec2c7b-5196-4c83-b7f6-0e24a146f53d',
            source_dimension: 'node',
            join_condition: `WITH candidates AS (
  SELECT
    s.id   AS line_id,
    p.id   AS pole_id,
    ST_LineMerge(s.geom) AS line_geom,
    p.geom AS pole_geom
  FROM sidewalks s
  JOIN poles p
    ON ST_DWithin(s.geom, p.geom, 2)
  WHERE (p.tags->>'amenity') = 'light_pole'
),
located AS (
  SELECT
    line_id,
    pole_id,
    ST_LineLocatePoint(line_geom, pole_geom) AS frac,
    ST_LineInterpolatePoint(line_geom,
                             ST_LineLocatePoint(line_geom, pole_geom)) AS proj_pt
  FROM candidates
)
SELECT *
FROM located
WHERE frac BETWEEN 0.2 AND 0.8;`,
            join_filter_target: '',
            join_filter_source: '',
            aggregate: [
                'ARRAY_AGG(ext:unit_id) as SDOT_pole_unit_id',
                'ARRAY_AGG(ext:subtypecd) as SDOT_subtypecd',
                'ARRAY_AGG(ext:pole_height) as SDOT_pole_height',
                'ARRAY_AGG(ext:pole_asset_id) as SDOT_pole_asset_id',
                'ARRAY_AGG(ext:pole_HasStreetlight) as SDOT_pole_HasStreetlight',
            ],
        })).not.toThrow();
    });

    it('allows column names that contain reserved words', () => {
        expect(() => Utility.checkForSqlInjection({
            join_filter_source: 'truncate = \'yes\'',
        })).not.toThrow();
    });

    it('rejects stacked statements in join_condition', () => {
        expect(() => Utility.checkForSqlInjection({
            join_condition: 'SELECT 1; DROP TABLE users',
        })).toThrow(InputException);
    });

    it('rejects DML statements in join_condition', () => {
        expect(() => Utility.checkForSqlInjection({
            join_condition: 'DROP TABLE users',
        })).toThrow(InputException);
    });

    it('rejects dangerous functions in aggregate', () => {
        expect(() => Utility.checkForSqlInjection({
            aggregate: ['pg_sleep(5)'],
        })).toThrow(InputException);
    });

    it('rejects comment tokens in non-SQL fields', () => {
        expect(() => Utility.checkForSqlInjection({
            feedback_text: 'test -- comment',
        })).toThrow(/Harmful token found in input/);
    });

    it('allows feedback text containing reserved words as plain text', () => {
        expect(() => Utility.checkForSqlInjection({
            feedback_text: 'please update the map',
        })).not.toThrow();
    });

    it('allows tag quality metric payloads with reserved-word tag names', () => {
        expect(() => Utility.checkForSqlInjection([{
            entity_type: 'Footway',
            tags: [
                'surface',
                'width',
                'incline',
                'length',
                'description',
                'name',
                'foot',
                'update',
            ],
        }])).not.toThrow();
    });

    it('recursively validates nested arrays', () => {
        expect(() => Utility.checkForSqlInjection([
            { entity_type: 'edge', tags: ['highway'] },
            { entity_type: 'node', tags: ['--comment'] },
        ])).toThrow(/\[1\]\.tags\[0\]/);
    });
});

describe('validateSqlExpression', () => {
    it('accepts PostGIS and aggregate functions', () => {
        expect(() => validateSqlExpression('ST_Contains(geometry_target, geometry_source)', 'condition', 'join_condition')).not.toThrow();
        expect(() => validateSqlExpression('array_agg(highway) as highways', 'expression', 'aggregate')).not.toThrow();
    });

    it('rejects stacked statements and comments', () => {
        expect(() => validateSqlExpression('1=1; DROP TABLE t', 'condition', 'join_condition')).toThrow(InputException);
        expect(() => validateSqlExpression('1=1 -- comment', 'condition', 'join_condition')).toThrow(InputException);
    });

    it('allows empty fragments', () => {
        expect(() => validateSqlExpression('', 'condition', 'join_filter_target')).not.toThrow();
    });
});

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
        const criteria = new QueryCriteria().setTable(table).setData(data).setWhere(where);
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
        const criteria = new QueryCriteria().setTable(table).setData(data).setWhere(where);
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
        const criteria = new QueryCriteria().setTable(table).setData(data).setWhere(where);

        // Assert
        expect(() => criteria.buildUpdateQuery()).toThrow('Invalid QueryCriteria input');
    });
});


describe('calculateTotalSize', () => {
    it('should return the total size of a valid ZIP file (uncompressed contents)', () => {
        // 1. Create an in-memory ZIP with AdmZip
        const zip = new AdmZip();
        const content = Buffer.from('Hello World!');
        zip.addFile('test.txt', content);

        // 2. Convert the ZIP to a Buffer
        const zipBuffer = zip.toBuffer();

        // 3. Mock up an Express.Multer.File object
        const files: Express.Multer.File[] = [
        {
            originalname: 'test.zip',
            mimetype: 'application/zip',
            buffer: zipBuffer,
            // The "size" is the compressed size. We'll set it for completeness,
            // but your function uses the uncompressed size from AdmZip.
            size: zipBuffer.length,
        } as Express.Multer.File,
        ];

        // 4. Call the function
        const totalSize = Utility.calculateTotalSize(files);

        // 5. We expect the uncompressed size (length of "Hello World!") -> 12 bytes
        expect(totalSize).toBe(content.length);
    })

    it('should fall back to the file size when the ZIP is invalid/corrupted', () => {
        // 1. Create a buffer that is NOT a valid ZIP
        const badZipBuffer = Buffer.from('NOT A VALID ZIP');
        const files: Express.Multer.File[] = [
          {
            originalname: 'corrupted.zip',
            mimetype: 'application/zip',
            buffer: badZipBuffer,
            size: badZipBuffer.length,
          } as Express.Multer.File,
        ];
    
        // 2. Call the function
        const totalSize = Utility.calculateTotalSize(files);
    
        // 3. If AdmZip throws an error, we catch it and use file.size instead
        expect(totalSize).toBe(badZipBuffer.length);
      });

      it('should return size for a normal file (non-ZIP)', () => {
        // 1. Create a mock text file buffer
        const text = 'This is a normal text file';
        const textBuffer = Buffer.from(text);
        const files: Express.Multer.File[] = [
          {
            originalname: 'test.txt',
            mimetype: 'text/plain',
            buffer: textBuffer,
            size: textBuffer.length,
          } as Express.Multer.File,
        ];
    
        // 2. Since it's not recognized as ZIP, the function just adds file.size
        const totalSize = Utility.calculateTotalSize(files);
        expect(totalSize).toBe(textBuffer.length);
      });
    
      it('should handle multiple files, mixing ZIP and non-ZIP', () => {
        // 1. Build a valid ZIP
        const zip = new AdmZip();
        const zipContent = Buffer.from('Zip Content');
        zip.addFile('inside-zip.txt', zipContent);
        const validZipBuffer = zip.toBuffer();
    
        // 2. Create a normal text file buffer
        const text = 'Plain text';
        const textBuffer = Buffer.from(text);
    
        // 3. Mock Multer files
        const files: Express.Multer.File[] = [
          {
            originalname: 'archive.zip',
            mimetype: 'application/zip',
            buffer: validZipBuffer,
            size: validZipBuffer.length,
          } as Express.Multer.File,
          {
            originalname: 'file.txt',
            mimetype: 'text/plain',
            buffer: textBuffer,
            size: textBuffer.length,
          } as Express.Multer.File,
        ];
    
        // 4. We expect total = uncompressed ZIP content size + text file size
        const expectedTotal = zipContent.length + textBuffer.length;
        const totalSize = Utility.calculateTotalSize(files);
        expect(totalSize).toBe(expectedTotal);
      });


})