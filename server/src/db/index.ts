import { drizzle as drizzlePg } from 'drizzle-orm/node-postgres';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';
import { DATABASE_URL, DB_POOL_MAX, DB_IDLE_TIMEOUT_MS, DB_CONNECTION_TIMEOUT_MS } from '../config';

type PgSchema = typeof schema;

export let pgPool: Pool | null = null;

export let db!: NodePgDatabase<PgSchema>;

export const initDatabase = async () => {
    const connectionString = DATABASE_URL;
    pgPool = new Pool({
        connectionString,
        max: DB_POOL_MAX,
        idleTimeoutMillis: DB_IDLE_TIMEOUT_MS,
        connectionTimeoutMillis: DB_CONNECTION_TIMEOUT_MS,
    });
    pgPool.on('error', (err) => {
        console.error('⚠️ PostgreSQL 连接池异常:', err.message);
    });
    db = drizzlePg(pgPool, { schema });

    try {
        await pgPool.query('SELECT 1');
        console.log('✅ PostgreSQL 连接成功');
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('❌ 数据库初始化失败:', msg);
        throw err;
    }
};

// 重新导出表定义
export const {
    users, scripts, installLogs, updateLogs, auditLogs,
    webhookLogs, captchaChallenges, captchaTokens, ratings,
} = schema;
