/**
 * 数据库方言检测。
 * 在 .env 中设置 DB_DIALECT=postgresql 以使用 PostgreSQL，否则默认为 SQLite。
 */
import { sql } from 'drizzle-orm';
import { DB_DIALECT } from '../config';

export type Dialect = 'sqlite' | 'postgresql';

export const dialect: Dialect = DB_DIALECT;

/** SQL 辅助函数，返回与方言兼容的时间戳表达式 */
export function currentTimestamp() {
    switch (dialect) {
        case 'postgresql':
            return sql`NOW()`;
        case 'sqlite':
            return sql`(cast(strftime('%s', 'now') as integer) * 1000)`;
        default:
            throw new Error(`不支持的数据库方言: ${dialect}`);
    }
}
