/**
 * Central configuration — all environment variables are read here.
 * Import this module instead of accessing process.env directly.
 */
import dotenv from 'dotenv';
import path from 'path';

// Load .env file before reading any config values
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

// ── Server ──
export const PORT = int('PORT', 3000);
export const NODE_ENV = env('NODE_ENV', 'development');
export const isProd = NODE_ENV === 'production';

// ── Database ──
export const DB_DIALECT = (env('DB_DIALECT', 'sqlite').toLowerCase() === 'postgresql' ? 'postgresql' : 'sqlite') as 'sqlite' | 'postgresql';
export const DATABASE_URL = env('DATABASE_URL', 'postgresql://localhost:5432/scriptshare');

// ── Security ──
export const SESSION_SECRET = env('SESSION_SECRET');
export const TRUST_PROXY = int('TRUST_PROXY', 1);
export const CORS_ORIGIN = env('CORS_ORIGIN', 'http://localhost:3000');

// ── Debug / Dev Tools ──
export const DEBUG_ENABLED = bool('DEBUG_ENABLED', false); // 默认关闭，通过 .env 中 DEBUG_ENABLED=true 开启
