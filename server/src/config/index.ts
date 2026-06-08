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

// ── 限流（基础配置） ──
export const API_RATE_LIMIT_WINDOW_MS = int('API_RATE_LIMIT_WINDOW_MS', 15 * 60 * 1000);
// 按用户等级的 API 限流（匿名 / 普通用户 / 管理员）
export const API_RATE_LIMIT_NO_COOKIE_MAX = int('API_RATE_LIMIT_NO_COOKIE_MAX', 30);
export const API_RATE_LIMIT_GUEST_MAX = int('API_RATE_LIMIT_GUEST_MAX', 60);
export const API_RATE_LIMIT_USER_MAX = int('API_RATE_LIMIT_USER_MAX', 200);

export const LOGIN_RATE_LIMIT_WINDOW_MS = int('LOGIN_RATE_LIMIT_WINDOW_MS', 15 * 60 * 1000);
export const LOGIN_RATE_LIMIT_MAX = int('LOGIN_RATE_LIMIT_MAX', 10);
export const WEBHOOK_RATE_LIMIT_WINDOW_MS = int('WEBHOOK_RATE_LIMIT_WINDOW_MS', 60000);
export const WEBHOOK_RATE_LIMIT_MAX = int('WEBHOOK_RATE_LIMIT_MAX', 60);
export const CAPTCHA_RATE_LIMIT_WINDOW_MS = int('CAPTCHA_RATE_LIMIT_WINDOW_MS', 60000);
export const CAPTCHA_RATE_LIMIT_MAX = int('CAPTCHA_RATE_LIMIT_MAX', 30);

// 写操作限流（按用户等级）
export const SCRIPTS_WRITE_WINDOW_MS = int('SCRIPTS_WRITE_WINDOW_MS', 60 * 60 * 1000);
export const SCRIPTS_WRITE_NO_COOKIE_MAX = int('SCRIPTS_WRITE_NO_COOKIE_MAX', 1);
export const SCRIPTS_WRITE_GUEST_MAX = int('SCRIPTS_WRITE_GUEST_MAX', 3);
export const SCRIPTS_WRITE_USER_MAX = int('SCRIPTS_WRITE_USER_MAX', 30);

export const CAPTCHA_CHALLENGE_LIMIT_MAX = int('CAPTCHA_CHALLENGE_LIMIT_MAX', 10);
export const CAPTCHA_REDEEM_LIMIT_MAX = int('CAPTCHA_REDEEM_LIMIT_MAX', 20);

// ── CAPTCHA 签名 ──
export const CAPTCHA_SIGN_SECRET = env('CAPTCHA_SIGN_SECRET') || env('SESSION_SECRET') || 'captcha-sign-dev-secret';
export const CAPTCHA_SIGN_EXPIRES_MS = int('CAPTCHA_SIGN_EXPIRES_MS', 10 * 60 * 1000);  // 挑战签名有效期（默认 10 分钟）
export const CAPTCHA_TOKEN_EXPIRES_MS = int('CAPTCHA_TOKEN_EXPIRES_MS', 20 * 60 * 1000); // 兑换后 token 有效期（默认 20 分钟）

// ── CAPTCHA PoW 难度参数 ──
export const CAPTCHA_POW_COUNT = int('CAPTCHA_POW_COUNT', 8);           // 子挑战数
export const CAPTCHA_POW_SALT_LEN = int('CAPTCHA_POW_SALT_LEN', 32);     // 盐长度（字节）
export const CAPTCHA_POW_DIFFICULTY = int('CAPTCHA_POW_DIFFICULTY', 2);  // 目标前缀 hex 字符数（bits = value * 4）
export const CAPTCHA_POW_MEMORY = int('CAPTCHA_POW_MEMORY', 16384);       // Argon2 内存（KiB）
export const CAPTCHA_POW_ITERATIONS = int('CAPTCHA_POW_ITERATIONS', 3);  // Argon2 迭代次数
export const CAPTCHA_POW_PARALLELISM = int('CAPTCHA_POW_PARALLELISM', 1); // Argon2 并行度

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

// ── 验证限制 ──
export const README_MAX_LENGTH = int('README_MAX_LENGTH', 50000);
export const MAX_CODE_SIZE = int('MAX_CODE_SIZE', 5 * 1024 * 1024);
export const METADATA_LINE_LIMIT = int('METADATA_LINE_LIMIT', 5000);

// ── 统计 & 排行榜 ──
export const STATS_TOP_N = int('STATS_TOP_N', 10);          // 排行榜最多显示条数
export const STATS_TREND_DAYS = int('STATS_TREND_DAYS', 30); // 趋势统计默认天数
export const STATS_LOG_LIMIT = int('STATS_LOG_LIMIT', 20);   // 审计/webhook 日志默认加载数
export const STATS_LOG_MAX = int('STATS_LOG_MAX', 200);      // 审计/webhook 日志最大限制



// ── Debug 种子数据 ──
export const DEBUG_SEED_TOTAL = int('DEBUG_SEED_TOTAL', 3000);
