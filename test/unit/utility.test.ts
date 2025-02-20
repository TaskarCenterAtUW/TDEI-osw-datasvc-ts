import { QueryCriteria } from "../../src/database/dynamic-update-query";
import { Utility } from "../../src/utility/utility"
import AdmZip from 'adm-zip';
import { Express } from 'express';

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