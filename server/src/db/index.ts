import path from 'path';
import fs from 'fs';

import { drizzle } from 'drizzle-orm/sql-js';
import { drizzle as drizzlePg } from 'drizzle-orm/node-postgres';
import initSqlJs, { type SqlJsStatic, type Database as SqlJsDatabase } from 'sql.js';
import { Pool } from 'pg';
import * as schema from './schema';
import { DATABASE_URL } from '../config';
import { dialect } from './dialect';

const DB_DIR = path.join(__dirname, '..', '..', 'data');
const DB_PATH = path.join(DB_DIR, 'scriptshare.db');

if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
}

let _db: ReturnType<typeof drizzle | typeof drizzlePg>;
let sqliteDb: SqlJsDatabase | null = null;
let pgPool: Pool | null = null;

const initDatabase = async () => {
    console.log(`🔧 数据库方言: ${dialect}`);

    switch (dialect) {
        case 'postgresql': {
            // ── PostgreSQL ──
            const connectionString = DATABASE_URL;
            pgPool = new Pool({
                connectionString,
                max: 20, // 最大连接数
                idleTimeoutMillis: 30000, // 空闲 30s 断开
                connectionTimeoutMillis: 5000, // 连接超时 5s
            });
            pgPool.on('error', (err) => {
                console.error('⚠️ PostgreSQL 连接池异常:', err.message);
            });
            _db = drizzlePg(pgPool, { schema }) as any;

            try {
                await pgPool.query('SELECT 1');
                console.log('✅ PostgreSQL 连接成功');
            } catch (err: any) {
                console.error('❌ PostgreSQL 连接失败:', err.message);
                throw err;
            }
            break;
        }
        case 'sqlite': {
            // ── SQLite (sql.js) ──
            const SQL: SqlJsStatic = await initSqlJs();
            const buffer = fs.existsSync(DB_PATH) ? fs.readFileSync(DB_PATH) : null;
            sqliteDb = new SQL.Database(buffer);
            sqliteDb.run('PRAGMA journal_mode = WAL');
            sqliteDb.run('PRAGMA foreign_keys = ON');
            sqliteDb.run('PRAGMA max_page_count = 50000');

            _db = drizzle(sqliteDb, { schema }) as any;

            // 开发模式：直接执行 SQL 文件建表
            const drizzleDir = path.join(__dirname, '..', '..', 'drizzle');
            if (fs.existsSync(drizzleDir)) {
                const files = fs.readdirSync(drizzleDir).filter(f => f.endsWith('.sql')).sort();
                for (const file of files) {
                    const sqlPath = path.join(drizzleDir, file);
                    const sqlContent = fs.readFileSync(sqlPath, 'utf-8');
                    const statements = sqlContent.split('--> statement-breakpoint');
                    for (const stmt of statements) {
                        const trimmed = stmt.trim();
                        if (trimmed) {
                            try {
                                sqliteDb.run(trimmed);
                            } catch (err: any) {
                                if (!err.message?.includes('already exists')) {
                                    console.warn(`⚠️  SQL 执行警告 (${file}):`, err.message);
                                }
                            }
                        }
                    }
                }
                console.log('✅ 数据库结构已同步');
            } else {
                console.warn('⚠️  Drizzle 迁移目录不存在，跳过结构同步。');
                console.warn('   运行 `npm run db:generate` 从 schema 生成迁移文件。');
            }

            // Save database to disk periodically
            setInterval(() => {
                try {
                    const data = sqliteDb!.export();
                    fs.writeFileSync(DB_PATH, Buffer.from(data));
                } catch { /* ignore */ }
            }, 5000);

            const saveDb = () => {
                try {
                    const data = sqliteDb!.export();
                    fs.writeFileSync(DB_PATH, Buffer.from(data));
                } catch { /* ignore */ }
            };
            process.on('exit', saveDb);
            process.on('SIGINT', () => { saveDb(); process.exit(0); });
            process.on('SIGTERM', () => { saveDb(); process.exit(0); });
            break;
        }
        default:
            throw new Error(`不支持的数据库方言: ${dialect}`);
    }
};

function ensureDb() {
    if (!_db) throw new Error('数据库尚未初始化，请先调用 initDatabase()');
    return _db;
}

// Proxy to lazily forward all property accesses to the initialized _db
export const db: any = new Proxy({} as any, {
    get(_, prop) {
        return (ensureDb() as any)[prop as string];
    },
});
export { initDatabase, dialect };

// Re-export table definitions from the schema
export const {
    users, scripts, installLogs, updateLogs, auditLogs,
    visitorLogs, webhookLogs, capChallenges, capTokens, ratings,
} = schema;
