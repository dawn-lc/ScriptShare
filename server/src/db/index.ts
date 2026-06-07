import path from 'path';
import fs from 'fs';

import { drizzle } from 'drizzle-orm/sql-js';
import { drizzle as drizzlePg } from 'drizzle-orm/node-postgres';
import initSqlJs, { type SqlJsStatic, type Database as SqlJsDatabase } from 'sql.js';
import { Pool } from 'pg';
import * as schema from './schema';
import { DATABASE_URL, DB_POOL_MAX, DB_IDLE_TIMEOUT_MS, DB_CONNECTION_TIMEOUT_MS, DB_SAVE_INTERVAL_MS, DB_MAX_PAGE_COUNT, DB_FILENAME } from '../config';
import { dialect, type Dialect } from './dialect';

const DB_DIR = path.join(__dirname, '..', '..', 'data');
const DB_PATH = path.join(DB_DIR, DB_FILENAME);

if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
}

let _db: ReturnType<typeof drizzle | typeof drizzlePg>;
let sqliteDb: SqlJsDatabase | null = null;
let pgPool: Pool | null = null;

/**
 * 执行单条 SQL 语句，忽略"已存在"错误。
 */
async function execSql(statement: string): Promise<void> {
    const trimmed = statement.trim();
    if (!trimmed) return;
    try {
        if (dialect === 'sqlite') {
            sqliteDb!.run(trimmed);
        } else {
            await pgPool!.query(trimmed);
        }
    } catch (err: unknown) {
        const sqlErr = err as { message?: string };
        if (!sqlErr.message?.includes('already exists') &&
            !sqlErr.message?.includes('duplicate column') &&
            !sqlErr.message?.includes('duplicate key')) {
            throw err;
        }
        // 非关键重复错误仅打印警告
        console.warn(`⚠️  (可忽略) ${sqlErr.message}`);
    }
}

/**
 * 基于 Drizzle meta journal 运行所有待处理的迁移。
 * - 读取 `meta/_journal.json` 获取迁移标签的有序列表。
 * - 通过 `__drizzle_migrations` 表追踪已应用的迁移。
 * - 仅运行尚未记录的迁移。
 */
async function runMigrations(): Promise<void> {
    const migrateDir = dialect === 'postgresql' ? 'drizzle-pg' : 'drizzle';
    const drizzleDir = path.join(__dirname, '..', '..', migrateDir);
    const metaDir = path.join(drizzleDir, 'meta');
    const journalFile = path.join(metaDir, '_journal.json');

    if (!fs.existsSync(journalFile)) {
        console.warn(`⚠️  未找到迁移日志 ${journalFile}，跳过迁移。`);
        return;
    }

    // 1. 读取迁移日志以获取有序迁移标签列表
    const journal = JSON.parse(fs.readFileSync(journalFile, 'utf-8'));
    const entries: { idx: number; tag: string }[] = journal.entries || [];

    if (entries.length === 0) {
        console.log('📭 没有待执行的迁移。');
        return;
    }

    // 2. 确保追踪表存在（内联创建，无需独立迁移）
    if (dialect === 'sqlite') {
        sqliteDb!.run(`CREATE TABLE IF NOT EXISTS __drizzle_migrations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            tag TEXT NOT NULL UNIQUE,
            applied_at TEXT DEFAULT (CURRENT_TIMESTAMP)
        )`);
    } else {
        await pgPool!.query(`CREATE TABLE IF NOT EXISTS __drizzle_migrations (
            id SERIAL PRIMARY KEY,
            tag TEXT NOT NULL UNIQUE,
            applied_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )`);
    }

    // 3. 收集已应用的标签
    const appliedTags = new Set<string>();
    try {
        const rows = dialect === 'sqlite'
            ? (sqliteDb!.exec('SELECT tag FROM __drizzle_migrations ORDER BY id')?.[0]?.values?.map(r => String(r[0])) ?? [])
            : (await pgPool!.query('SELECT tag FROM __drizzle_migrations ORDER BY id')).rows.map(r => r.tag);
        for (const tag of rows) appliedTags.add(tag);
    } catch {
        // 表可能不存在或为空——这没问题
    }

    // 4. 按顺序执行待处理的迁移
    let pendingCount = 0;
    for (const entry of entries) {
        if (appliedTags.has(entry.tag)) continue;

        const sqlFile = path.join(drizzleDir, `${entry.tag}.sql`);
        if (!fs.existsSync(sqlFile)) {
            console.warn(`⚠️  迁移文件 ${sqlFile} 不存在，跳过。`);
            continue;
        }

        const sqlContent = fs.readFileSync(sqlFile, 'utf-8');
        const statements = sqlContent.split('--> statement-breakpoint');

        console.log(`📦 执行迁移: ${entry.tag}`);

        try {
            for (const stmt of statements) {
                await execSql(stmt);
            }
            // 记录成功迁移
            if (dialect === 'sqlite') {
                sqliteDb!.run(`INSERT INTO __drizzle_migrations (tag) VALUES (?)`, [entry.tag]);
            } else {
                await pgPool!.query('INSERT INTO __drizzle_migrations (tag) VALUES ($1)', [entry.tag]);
            }
            pendingCount++;
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            console.error(`❌ 迁移 ${entry.tag} 失败:`, msg);
            throw err;
        }
    }

    if (pendingCount > 0) {
        console.log(`✅ 数据库结构已同步 (已执行 ${pendingCount} 个迁移)`);
    } else {
        console.log(`✅ 数据库已是最新 (${appliedTags.size} 个迁移已执行)`);
    }
}

const initDatabase = async () => {
    console.log(`🔧 数据库方言: ${dialect}`);

    switch (dialect) {
        case 'postgresql': {
            // ── PostgreSQL 数据库 ──
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
            // drizzlePg 返回类型是 ReturnType<typeof drizzlePg> 的子类型，赋值给联合类型变量不需要断言
            _db = drizzlePg(pgPool, { schema });

            try {
                await pgPool.query('SELECT 1');
                console.log('✅ PostgreSQL 连接成功');
                await runMigrations();
            } catch (err: unknown) {
                const msg = err instanceof Error ? err.message : String(err);
                console.error('❌ 数据库初始化失败:', msg);
                throw err;
            }
            break;
        }
        case 'sqlite': {
            // ── SQLite 数据库（sql.js） ──
            const SQL: SqlJsStatic = await initSqlJs();
            const buffer = fs.existsSync(DB_PATH) ? fs.readFileSync(DB_PATH) : null;
            sqliteDb = new SQL.Database(buffer);
            sqliteDb.run('PRAGMA journal_mode = WAL');
            sqliteDb.run('PRAGMA foreign_keys = ON');
            sqliteDb.run(`PRAGMA max_page_count = ${DB_MAX_PAGE_COUNT}`);

            // drizzle(sql-js) 返回类型是 ReturnType<typeof drizzle> 的子类型，赋值给联合类型变量不需要断言
            _db = drizzle(sqliteDb, { schema });

            await runMigrations();

            // 定期将数据库保存到磁盘
            setInterval(() => {
                try {
                    const data = sqliteDb!.export();
                    fs.writeFileSync(DB_PATH, Buffer.from(data));
                } catch { /* ignore */ }
            }, DB_SAVE_INTERVAL_MS);

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

/**
 * 动态代理转发到已初始化的 _db 实例。
 * 类型标注为 any 的原因：
 * 1. SQLite (sql.js) 和 PostgreSQL (pg) 的 Drizzle ORM 查询构建器类型不兼容，无法定义统一的静态类型
 * 2. Proxy 在运行时动态转发属性访问，编译期无法确定 _db 的具体方言类型
 * 3. 所有使用 db 的地方通过运行时实际的数据库方言执行查询，类型安全由运行时保证
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const db: any = new Proxy({}, {
    // prop 类型为 string | symbol，数据库操作方法名始终为字符串
    get(_, prop: string) {
        // 确保 _db 已初始化后访问其属性，运行时始终返回正确的数据库操作方法
        return (ensureDb() as any)[prop];
    },
});
export { initDatabase, dialect };

// 从 schema 重新导出表定义
export const {
    users, scripts, installLogs, updateLogs, auditLogs,
    webhookLogs, capChallenges, capTokens, ratings,
} = schema;
