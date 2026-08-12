import { Parser } from "node-sql-parser";
import { InputException } from "../exceptions/http/http-exceptions";

const parser = new Parser();

// Comment markers can comment-out the surrounding generated SQL once interpolated.
// A mid-fragment semicolon enables stacked statements (trailing ';' alone is fine).
export const COMMENT_TOKEN_PATTERN = /--|\/\*|\*\//;
export const MID_STATEMENT_SEPARATOR_PATTERN = /;\s*\S/;

// AST statement types that mutate data/schema or change privileges.
// Compared case sensitively: node-sql-parser emits statement types in lower case
// ('update', 'delete', ...) while non-statement nodes use upper case values such
// as ORDER BY's 'DESC', which would otherwise be mistaken for a DESC statement.
const DENIED_STATEMENT_TYPES = new Set([
    'insert', 'update', 'delete', 'replace', 'merge',
    'drop', 'create', 'alter', 'truncate', 'rename',
    'grant', 'revoke', 'call', 'exec', 'execute',
    'copy', 'load', 'lock', 'unlock', 'set', 'use', 'declare'
]);

// Statement phrases, used as a safety net when the AST is unavailable or partial.
const DML_STATEMENT_PATTERNS: RegExp[] = [
    /\bINSERT\s+INTO\b/i,
    /\bUPDATE\s+(?:ONLY\s+)?[\w."']+(?:\s+(?:AS\s+)?\w+)?\s+SET\b/i,
    /\bDELETE\s+FROM\b/i,
    /\bDROP\s+(?:TABLE|INDEX|VIEW|SCHEMA|DATABASE|FUNCTION|PROCEDURE|ROLE|USER|EXTENSION|TYPE|SEQUENCE|TRIGGER|MATERIALIZED)\b/i,
    /\bCREATE\s+(?:OR\s+REPLACE\s+)?(?:TEMP\s+|TEMPORARY\s+|UNIQUE\s+)?(?:TABLE|INDEX|VIEW|SCHEMA|DATABASE|FUNCTION|PROCEDURE|ROLE|USER|EXTENSION|TYPE|SEQUENCE|TRIGGER|MATERIALIZED)\b/i,
    /\bALTER\s+(?:TABLE|INDEX|VIEW|SCHEMA|DATABASE|FUNCTION|PROCEDURE|ROLE|USER|TYPE|SEQUENCE)\b/i,
    /\bGRANT\s+(?:(?:ALL|SELECT|INSERT|UPDATE|DELETE|TRUNCATE|REFERENCES|TRIGGER|CREATE|CONNECT|TEMPORARY|TEMP|EXECUTE|USAGE|SET|MAINTAIN|ALTER\s+SYSTEM)\b|[\w."']+\s+TO\b)/i,
    /\bREVOKE\s+(?:(?:GRANT|ADMIN)\s+OPTION\s+FOR\s+)?(?:(?:ALL|SELECT|INSERT|UPDATE|DELETE|TRUNCATE|REFERENCES|TRIGGER|CREATE|CONNECT|TEMPORARY|TEMP|EXECUTE|USAGE|SET|MAINTAIN|ALTER\s+SYSTEM)\b|[\w."']+\s+FROM\b)/i,
    /\bTRUNCATE\s+TABLE\b/i,
    /(?:^|[(;])\s*TRUNCATE\s+[\w."']+\s*(?:CASCADE|RESTART\s+IDENTITY|CONTINUE\s+IDENTITY)?\s*$/i,
    /(?:^|[(;])\s*CALL\s+[\w."']+\s*\(/i,
    /(?:^|[(;])\s*COPY\s+[\w."']+\s+(?:FROM|TO)\b/i,
    /(?:^|[(;])\s*SET\s+\w+\s*(?:=|\bTO\b)/i,
    /\bMERGE\s+INTO\b/i,
    /\bALTER\s+SYSTEM\b/i,
    /\bREFRESH\s+MATERIALIZED\s+VIEW\b/i,
    /\bIMPORT\s+FOREIGN\s+SCHEMA\b/i,
    /\bSECURITY\s+LABEL\s+ON\b/i,
    /\bCOMMENT\s+ON\s+(?:TABLE|COLUMN|SCHEMA|DATABASE|FUNCTION|INDEX|VIEW|TYPE|SEQUENCE|TRIGGER|ROLE|EXTENSION)\b/i,
    /\bINTO\s+(?:TEMP\s+|TEMPORARY\s+|UNLOGGED\s+)?[\w."']+\s+FROM\b/i,
    /\bLOCK\s+TABLE\b/i,
    /\bREINDEX\b/i,
    /\bVACUUM\b/i,
    /\bCHECKPOINT\b/i,
    /\bDISCARD\s+(?:ALL|PLANS|SEQUENCES|TEMPORARY|TEMP)\b/i,
    /\bCLUSTER\s+(?:VERBOSE\s+)?[\w."']+\s+USING\b/i,
    /^\s*(?:LISTEN|UNLISTEN|NOTIFY)\s+[\w."']+\s*(?:,\s*''\s*)?$/i,
    /^\s*RESET\s+(?:ALL|SESSION\s+AUTHORIZATION|[\w."]+)\s*$/i
];

const DANGEROUS_FUNCTION_PATTERNS: RegExp[] = [
    /^pg_/i,
    /^dblink/i,
    /^lo_/i,
    /^current_setting$/i,
    /^set_config$/i,
    /^query_to_xml/i,
    /^database_to_xml/i,
    /^table_to_xml/i,
    /^xmltable$/i
];

const DANGEROUS_FUNCTION_CALL_PATTERN =
    /\b(pg_\w+|dblink\w*|lo_\w+|current_setting|set_config|query_to_xml\w*|database_to_xml\w*|table_to_xml\w*|xmltable)\s*\(/i;

const DYNAMIC_SQL_PATTERNS: RegExp[] = [
    /\bEXECUTE\s+IMMEDIATE\b/i,
    /\bEXECUTE\s*(?:'|\$\$|\$[A-Za-z_]\w*\$)/i,
    /\bPREPARE\s+[\w."']+\s+AS\b/i,
    /\bDO\s*(?:'|\$\$|\$[A-Za-z_]\w*\$)/i
];

const QUOTED_SECTION_PATTERN = /(?<![\w$])[eE]'(?:[^'\\]|''|\\[\s\S])*'|'(?:[^']|'')*'|"(?:[^"]|"")*"/g;

export const SQL_CONDITION_FIELDS = new Set([
    'join_condition',
    'join_filter_target',
    'join_filter_source',
]);

export const SQL_EXPRESSION_ARRAY_FIELDS = new Set(['aggregate']);

// Fields whose values are interpolated into the generated SQL as bare
// identifiers or inside a string literal (tag quality metric), where a quote or
// a parenthesis would break out of the surrounding literal.
export const SQL_IDENTIFIER_ARRAY_FIELDS = new Set(['tags']);

// Property names as they appear in OSW data: word characters plus the ':'
// namespace separator ('ext:unit_id', 'ext:osw_sidewalk:left', '_u_id').
// Everything else is excluded, including the quotes, parentheses and comment
// markers that would let a tag escape the literal it is interpolated into.
const SQL_IDENTIFIER_PATTERN = /^[A-Za-z_][A-Za-z0-9_:]*$/;

function getFunctionNameParts(node: any): string[] {
    const name = node.name;
    if (typeof name === 'string') return name.split('.');
    if (name && Array.isArray(name.name)) return name.name.map((part: any) => String(part.value ?? ''));
    return [];
}

function normalizeStatements(ast: any): any[] {
    if (ast == null) return [];
    return (Array.isArray(ast) ? ast : [ast]).flatMap((item) => {
        if (item && typeof item === 'object' && item.stmt && !item.type) {
            return [item.stmt];
        }
        return [item];
    });
}

function assertSafeSqlAst(node: any, fieldName: string): void {
    if (node === null || node === undefined || typeof node !== 'object') return;
    if (Array.isArray(node)) {
        for (const item of node) assertSafeSqlAst(item, fieldName);
        return;
    }

    if (typeof node.type === 'string') {
        const type = node.type.toLowerCase();
        if (DENIED_STATEMENT_TYPES.has(type)) {
            throw new InputException(`SQL statement type '${node.type}' is not allowed in input : ${fieldName}`);
        }
        if (node.type === 'function' || node.type === 'aggr_func') {
            for (const namePart of getFunctionNameParts(node)) {
                if (DANGEROUS_FUNCTION_PATTERNS.some(pattern => pattern.test(namePart))) {
                    throw new InputException(`Function '${namePart}' is not allowed in input : ${fieldName}`);
                }
            }
        }
    }

    for (const key of Object.keys(node)) {
        assertSafeSqlAst(node[key], fieldName);
    }
}

function assertSafeSqlText(sql: string, fieldName: string): void {
    for (const pattern of DYNAMIC_SQL_PATTERNS) {
        if (pattern.test(sql)) {
            throw new InputException(`Dynamic SQL execution is not allowed in input : ${fieldName}`);
        }
    }

    const withoutQuotedSections = sql.replace(QUOTED_SECTION_PATTERN, "''");

    if (DANGEROUS_FUNCTION_CALL_PATTERN.test(withoutQuotedSections)) {
        throw new InputException(`Dangerous function is not allowed in input : ${fieldName}`);
    }
    for (const pattern of DML_STATEMENT_PATTERNS) {
        if (pattern.test(withoutQuotedSections)) {
            throw new InputException(`SQL DML/DDL statement is not allowed in input : ${fieldName}`);
        }
    }
}

function parseSql(sql: string): any {
    try {
        return parser.astify(sql);
    } catch {
        return parser.astify(sql, { database: 'postgresql' });
    }
}

function tryParseSql(sql: string): any | undefined {
    try {
        return parseSql(sql);
    } catch {
        return undefined;
    }
}

function isUsableSelectAst(ast: any): boolean {
    const statements = normalizeStatements(ast);
    return statements.length >= 1 && statements.every((s) => s && s.type === 'select');
}

/**
 * Lightweight check for non-SQL string fields (feedback text, tags, etc.).
 */
export function assertSafePlainText(value: string, fieldName: string): void {
    if (COMMENT_TOKEN_PATTERN.test(value)) {
        throw new InputException(`Harmful token found in input : ${fieldName}`);
    }
    if (MID_STATEMENT_SEPARATOR_PATTERN.test(value)) {
        throw new InputException(`Harmful token found in input : ${fieldName}`);
    }
}

/**
 * Validates a value that is interpolated into the generated SQL as an
 * identifier or inside a string literal, so it must not contain quotes or any
 * other character that could terminate the surrounding literal.
 */
export function assertSafeSqlIdentifier(value: string, fieldName: string): void {
    if (!value || value.trim() === '') return;

    if (!SQL_IDENTIFIER_PATTERN.test(value)) {
        throw new InputException(`Invalid identifier in input : ${fieldName}`);
    }
}

/**
 * Validates a user-supplied SQL fragment.
 *
 * Allowed: free-text SELECT / expressions, subqueries, CTEs, UNION, and
 * identifiers that happen to be reserved words (e.g. alias `update`).
 * Rejected: comment tokens, stacked statements, DML/DDL statements, denylisted
 * functions. Validation only — the original fragment is interpolated as-is.
 */
export function validateSqlExpression(fragment: string, kind: 'condition' | 'expression', fieldName: string): void {
    if (!fragment || fragment.trim() === '') return;

    if (COMMENT_TOKEN_PATTERN.test(fragment)) {
        throw new InputException(`Harmful token found in input : ${fieldName}`);
    }
    if (MID_STATEMENT_SEPARATOR_PATTERN.test(fragment)) {
        throw new InputException(`Multiple SQL statements are not allowed in input : ${fieldName}`);
    }

    const trimmed = fragment.trim().replace(/;+\s*$/, '');

    assertSafeSqlText(trimmed, fieldName);

    const rawAst = tryParseSql(trimmed);
    if (rawAst) {
        if (normalizeStatements(rawAst).length !== 1) {
            throw new InputException(`Multiple SQL statements are not allowed in input : ${fieldName}`);
        }
        assertSafeSqlAst(rawAst, fieldName);
        if (isUsableSelectAst(rawAst)) return;
    }

    const wrapped = kind === 'condition'
        ? `SELECT 1 FROM t WHERE ${trimmed}`
        : `SELECT ${trimmed} FROM t`;
    const wrappedAst = tryParseSql(wrapped);
    if (wrappedAst) {
        if (normalizeStatements(wrappedAst).length !== 1) {
            throw new InputException(`Multiple SQL statements are not allowed in input : ${fieldName}`);
        }
        assertSafeSqlAst(wrappedAst, fieldName);
    }
}
