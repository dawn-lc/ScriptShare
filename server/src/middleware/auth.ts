import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

import { SESSION_SECRET, isProd, TOKEN_DURATION_MS, RENEW_THRESHOLD_MS, PASSWORD_ITERATIONS } from '../config';
import { db } from '../db';
import { users } from '../db';
import { eq } from 'drizzle-orm';

// 扩展 Express Request 以携带认证信息
declare global {
    namespace Express {
        interface Request {
            user?: AuthPayload;
        }
    }
}

function getSecret(): string {
    if (!SESSION_SECRET) {
        console.error('❌ 环境变量 SESSION_SECRET 未设置，请配置一个随机字符串。');
        console.error('   示例 (.env 文件): SESSION_SECRET=your-random-secret-here');
        throw new Error('SESSION_SECRET is not set');
    }
    return SESSION_SECRET;
}

export interface AuthPayload {
    userId: number | null;
    username: string;
    role: string;
    tokenNonce: string;
    iat: number;
    exp: number;
}

interface UserRow {
    id: number;
    username: string;
    role: string;
    tokenNonce: string;
}

// TOKEN_DURATION_MS / RENEW_THRESHOLD_MS 来自 config

/** 在响应中设置 session_token cookie。 */
function setSessionCookie(res: Response, token: string): void {
    res.cookie('session_token', token, {
        httpOnly: true,
        sameSite: 'lax',
        secure: isProd,
        maxAge: TOKEN_DURATION_MS, // 24 hours
        path: '/',
    });
}

/**
 * 如果 token 仍有效但即将过期，签发续期 token。
 * 返回续期后的 token（无需续期时返回 null）。
 */
export function renewTokenIfNeeded(payload: AuthPayload, res: Response): string | null {
    const remaining = payload.exp - Date.now();
    if (remaining > RENEW_THRESHOLD_MS) return null; // token 仍有效，无需续期

    // 构建新 token，延长有效期
    const token = createUserToken({ id: payload.userId!, username: payload.username, role: payload.role, tokenNonce: payload.tokenNonce });
    setSessionCookie(res, token);
    return token;
}

// 为用户生成签名 session token
export function createUserToken(user: UserRow): string {
    const now = Date.now();
    const payload: AuthPayload = {
        userId: user.id,
        username: user.username,
        role: user.role,
        tokenNonce: user.tokenNonce,
        iat: now,
        exp: now + TOKEN_DURATION_MS,
    };
    const data = JSON.stringify(payload);
    const base64 = Buffer.from(data).toString('base64');
    const sig = crypto.createHmac('sha256', getSecret()).update(base64).digest('hex').substring(0, 16);
    return `${base64}.${sig}`;
}

// 验证并解码 session token
export function verifyToken(token: string): AuthPayload | null {
    const parts = token.split('.');
    if (parts.length !== 2) return null;

    const [base64, sig] = parts;
    const expectedSig = crypto.createHmac('sha256', getSecret()).update(base64).digest('hex').substring(0, 16);

    if (sig !== expectedSig) return null;

    try {
        const data = JSON.parse(Buffer.from(base64, 'base64').toString('utf-8'));
        // JSON.parse 返回 unknown，Token 结构由服务端签名保证，运行时类型安全
        const payload = data as AuthPayload;
        // 检查 token 过期
        if (payload.exp && Date.now() > payload.exp) {
            return null;
        }
        return payload;
    } catch {
        return null;
    }
}

/**
 * 使用 PBKDF2 + 随机盐值对密码进行哈希
 */
export function hashPassword(password: string): string {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.pbkdf2Sync(password, salt, PASSWORD_ITERATIONS, 64, 'sha512').toString('hex');
    return `${salt}:${hash}`;
}

/**
 * 验证密码与哈希值是否匹配
 */
export function verifyPassword(password: string, stored: string): boolean {
    const [salt, hash] = stored.split(':');
    if (!salt || !hash) return false;
    const computed = crypto.pbkdf2Sync(password, salt, PASSWORD_ITERATIONS, 64, 'sha512').toString('hex');
    // 常量时间比较，防止时序攻击
    const a = Buffer.from(hash);
    const b = Buffer.from(computed);
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
}

/**
 * 检查 token 的 tokenNonce 是否与数据库中用户的当前 tokenNonce 匹配。
 * 若不匹配，则 token 已失效（如登出后）。
 */
function checkTokenNonce(payload: AuthPayload): boolean {
    if (!payload.userId) return false;
    // db 为 Proxy 动态类型，select 返回类型无法静态推导，需显式标注返回结构
    const user = db.select({ tokenNonce: users.tokenNonce })
        .from(users).where(eq(users.id, payload.userId)).get() as { tokenNonce: string } | undefined;
    if (!user) return false;
    return user.tokenNonce === payload.tokenNonce;
}

// 中间件：要求登录
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
    const token = req.cookies?.session_token;

    if (!token) {
        res.status(401).json({ error: '请先登录', code: 'AUTH_REQUIRED' });
        return;
    }

    const payload = verifyToken(token);
    if (!payload || !payload.userId) {
        res.clearCookie('session_token', { path: '/' });
        res.status(401).json({ error: '登录已过期，请重新登录', code: 'AUTH_EXPIRED' });
        return;
    }

    // 检查 token 是否已失效（如登出）
    if (!checkTokenNonce(payload)) {
        res.clearCookie('session_token', { path: '/' });
        res.status(401).json({ error: '登录已失效，请重新登录', code: 'AUTH_INVALIDATED' });
        return;
    }

    // token 即将过期时续期（滚动会话）
    renewTokenIfNeeded(payload, res);

    // 将用户信息附加到请求
    req.user = payload;
    next();
}

// 中间件：要求管理员角色
export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
    requireAuth(req, res, () => {
        const user = req.user!;
        if (user.role !== 'admin') {
            res.status(403).json({ error: '需要管理员权限', code: 'FORBIDDEN' });
            return;
        }
        next();
    });
}

// 中间件：可选认证（已登录时附加用户信息）
export function optionalAuth(req: Request, res: Response, next: NextFunction): void {
    const token = req.cookies?.session_token;
    if (token) {
        const payload = verifyToken(token);
        if (payload && payload.userId && checkTokenNonce(payload)) {
            // token 即将过期时续期（滚动会话）
            renewTokenIfNeeded(payload, res);
            req.user = payload;
        }
    }
    next();
}

// 辅助函数：从请求中获取当前用户（在 requireAuth/optionalAuth 之后使用）
export function getCurrentUser(req: Request): AuthPayload | null {
    return req.user || null;
}
