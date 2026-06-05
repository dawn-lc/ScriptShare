import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

import { SESSION_SECRET } from '../config';

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
    iat: number;
    exp: number;
}

interface UserRow {
    id: number;
    username: string;
    role: string;
}

const TOKEN_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// Generate a signed session token for a user
export function createUserToken(user: UserRow): string {
    const now = Date.now();
    const payload: AuthPayload = {
        userId: user.id,
        username: user.username,
        role: user.role,
        iat: now,
        exp: now + TOKEN_DURATION_MS,
    };
    const data = JSON.stringify(payload);
    const base64 = Buffer.from(data).toString('base64');
    const sig = crypto.createHmac('sha256', getSecret()).update(base64).digest('hex').substring(0, 16);
    return `${base64}.${sig}`;
}

// Verify and decode session token
export function verifyToken(token: string): AuthPayload | null {
    const parts = token.split('.');
    if (parts.length !== 2) return null;

    const [base64, sig] = parts;
    const expectedSig = crypto.createHmac('sha256', getSecret()).update(base64).digest('hex').substring(0, 16);

    if (sig !== expectedSig) return null;

    try {
        const data = JSON.parse(Buffer.from(base64, 'base64').toString('utf-8'));
        const payload = data as AuthPayload;
        // Check token expiration
        if (payload.exp && Date.now() > payload.exp) {
            return null;
        }
        return payload;
    } catch {
        return null;
    }
}

/**
 * Hash a password with PBKDF2 + random salt
 */
export function hashPassword(password: string): string {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
    return `${salt}:${hash}`;
}

/**
 * Verify a password against its hash
 */
export function verifyPassword(password: string, stored: string): boolean {
    const [salt, hash] = stored.split(':');
    if (!salt || !hash) return false;
    const computed = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
    // Constant-time compare
    const a = Buffer.from(hash);
    const b = Buffer.from(computed);
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
}

// Middleware: require authentication
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

    // Attach user to request
    (req as any).user = payload;
    next();
}

// Middleware: require admin role
export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
    requireAuth(req, res, () => {
        const user = (req as any).user as AuthPayload;
        if (user.role !== 'admin') {
            res.status(403).json({ error: '需要管理员权限', code: 'FORBIDDEN' });
            return;
        }
        next();
    });
}

// Middleware: optional auth check (attaches user if logged in)
export function optionalAuth(req: Request, _res: Response, next: NextFunction): void {
    const token = req.cookies?.session_token;
    if (token) {
        const payload = verifyToken(token);
        if (payload && payload.userId) {
            (req as any).user = payload;
        }
    }
    next();
}

// Helper: get current user from request (after requireAuth/optionalAuth)
export function getCurrentUser(req: Request): AuthPayload | null {
    return (req as any).user || null;
}
