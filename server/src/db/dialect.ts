/**
 * Database dialect detection.
 * Set DB_DIALECT=postgresql in .env to use PostgreSQL, otherwise defaults to SQLite.
 */
import { sql } from 'drizzle-orm';
import { DB_DIALECT } from '../config';

export type Dialect = 'sqlite' | 'postgresql';

export const dialect: Dialect = DB_DIALECT;

/** SQL helper returns dialect-appropriate timestamp expression */
export function currentTimestamp() {
    switch (dialect) {
        case 'postgresql':
            return sql`NOW()`;
        case 'sqlite':
            return sql`CURRENT_TIMESTAMP`;
        default:
            throw new Error(`不支持的数据库方言: ${dialect}`);
    }
}
