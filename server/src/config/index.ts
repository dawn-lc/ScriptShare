/**
 * 中心配置——所有环境变量在此读取。
 * 请导入此模块而非直接访问 process.env。
 */
import dotenv from 'dotenv';
import path from 'path';

// 在读取配置值之前加载 .env 文件
dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

function env(key: string, fallback: string = ''): string {
    return process.env[key] ?? fallback;
}

function bool(key: string, fallback = false): boolean {
    const val = process.env[key];
    if (val === undefined || val === '') return fallback;
    return val === 'true' || val === '1';
}

function int(key: string, fallback: number): number {
    const raw = process.env[key];
    if (raw === undefined || raw === '') return fallback;
    const n = parseInt(raw, 10);
    return isNaN(n) ? fallback : n;
}

// ── 服务器 ──
export const PORT = int('PORT', 3000);
export const NODE_ENV = env('NODE_ENV', 'development');
export const isProd = NODE_ENV === 'production';

// ── 数据库 ──
const rawDialect = env('DB_DIALECT', 'sqlite').toLowerCase();
export const DB_DIALECT: 'sqlite' | 'postgresql' = rawDialect === 'postgresql' ? 'postgresql' : 'sqlite';
export const DATABASE_URL = env('DATABASE_URL', 'postgresql://localhost:5432/scriptshare');

// ── 安全 ──
export const SESSION_SECRET = env('SESSION_SECRET');
export const TRUST_PROXY = int('TRUST_PROXY', 1);
export const CORS_ORIGIN = env('CORS_ORIGIN', 'http://localhost:3000');

// ── 管理员初始化 ──
export const ADMIN_USERNAME = env('ADMIN_USERNAME');
export const ADMIN_PASSWORD = env('ADMIN_PASSWORD');

// ── 调试 / 开发工具 ──
export const DEBUG_ENABLED = bool('DEBUG_ENABLED', false); // 默认关闭，通过 .env 中 DEBUG_ENABLED=true 开启

// ── 限流 ──
export const API_RATE_LIMIT_WINDOW_MS = int('API_RATE_LIMIT_WINDOW_MS', 15 * 60 * 1000);
export const API_RATE_LIMIT_MAX = int('API_RATE_LIMIT_MAX', 200);
export const LOGIN_RATE_LIMIT_WINDOW_MS = int('LOGIN_RATE_LIMIT_WINDOW_MS', 15 * 60 * 1000);
export const LOGIN_RATE_LIMIT_MAX = int('LOGIN_RATE_LIMIT_MAX', 10);
export const WEBHOOK_RATE_LIMIT_WINDOW_MS = int('WEBHOOK_RATE_LIMIT_WINDOW_MS', 60000);
export const WEBHOOK_RATE_LIMIT_MAX = int('WEBHOOK_RATE_LIMIT_MAX', 60);
export const CAP_RATE_LIMIT_WINDOW_MS = int('CAP_RATE_LIMIT_WINDOW_MS', 60000);
export const CAP_RATE_LIMIT_MAX = int('CAP_RATE_LIMIT_MAX', 30);
export const SCRIPTS_WRITE_WINDOW_MS = int('SCRIPTS_WRITE_WINDOW_MS', 60 * 60 * 1000);
export const SCRIPTS_WRITE_MAX = int('SCRIPTS_WRITE_MAX', 30);
export const CAP_CHALLENGE_LIMIT_MAX = int('CAP_CHALLENGE_LIMIT_MAX', 10);
export const CAP_REDEEM_LIMIT_MAX = int('CAP_REDEEM_LIMIT_MAX', 20);

// ── Token / 认证 ──
export const TOKEN_DURATION_MS = int('TOKEN_DURATION_MS', 24 * 60 * 60 * 1000);
export const RENEW_THRESHOLD_MS = int('RENEW_THRESHOLD_MS', 1 * 60 * 60 * 1000);
export const PASSWORD_ITERATIONS = int('PASSWORD_ITERATIONS', 100000);

// ── 登录锁定 ──
export const MAX_LOGIN_ATTEMPTS = int('MAX_LOGIN_ATTEMPTS', 5);
export const LOCKOUT_DURATION_MS = int('LOCKOUT_DURATION_MS', 15 * 60 * 1000);
export const ATTEMPT_WINDOW_MS = int('ATTEMPT_WINDOW_MS', 30 * 60 * 1000);

// ── 数据库连接池 ──
export const DB_POOL_MAX = int('DB_POOL_MAX', 20);
export const DB_IDLE_TIMEOUT_MS = int('DB_IDLE_TIMEOUT_MS', 30000);
export const DB_CONNECTION_TIMEOUT_MS = int('DB_CONNECTION_TIMEOUT_MS', 5000);
export const DB_SAVE_INTERVAL_MS = int('DB_SAVE_INTERVAL_MS', 5000);
export const DB_MAX_PAGE_COUNT = int('DB_MAX_PAGE_COUNT', 50000);

// ── 验证限制 ──
export const README_MAX_LENGTH = int('README_MAX_LENGTH', 50000);
export const MAX_CODE_SIZE = int('MAX_CODE_SIZE', 5 * 1024 * 1024);
export const METADATA_LINE_LIMIT = int('METADATA_LINE_LIMIT', 5000);

// ── 文件路径 ──
export const DB_FILENAME = env('DB_FILENAME', 'scriptshare.db');

// ── Debug 种子数据 ──
export const DEBUG_SEED_TOTAL = int('DEBUG_SEED_TOTAL', 3000);
