import { Router, Request, Response } from 'express';
import { db } from '../db';
import { users, scripts, capTokens } from '../db';
import { eq, and, gt, count, sql } from 'drizzle-orm';
import { requireAuth, createUserToken, verifyToken, renewTokenIfNeeded, hashPassword, verifyPassword, getCurrentUser, AuthPayload } from '../middleware/auth';
import crypto from 'crypto';
import { sanitizeField, FIELD_LIMITS } from '../utils/validate';
import { audit } from '../utils/audit';
import cap from '../utils/cap';
import { isProd, MAX_LOGIN_ATTEMPTS, LOCKOUT_DURATION_MS, ATTEMPT_WINDOW_MS } from '../config';
import { getClientIp, hashIP } from '../utils/ip';

const router = Router();

// ── 注册 ──

// POST /api/auth/register - 创建新账号（需要验证码）
router.post('/register', async (req: Request, res: Response) => {
    const { username, password, displayName: display_name, captchaToken: captcha_token } = req.body;

    // 验证 Cap token（管理员初始化后所有注册都需要验证码）
    if (!captcha_token && !req.body.cap_token) {
        res.status(400).json({ error: '请完成验证码', code: 'CAPTCHA_REQUIRED' });
        return;
    }
    const capToken = captcha_token || req.body.cap_token;

    // 原子操作：DELETE + 过期检查合并为一条 SQL，消除竞态条件
    const delResult = db.delete(capTokens)
        .where(and(
            eq(capTokens.key, capToken),
            gt(capTokens.expires, Date.now()),
        )).run() as { changes?: number; rowCount?: number };
    const affected = delResult.changes ?? delResult.rowCount ?? 0;
    if (affected === 0) {
        res.status(400).json({ error: '验证码错误或已使用', code: 'CAPTCHA_WRONG' });
        return;
    }

    if (!username || typeof username !== 'string') {
        res.status(400).json({ error: '请输入用户名' });
        return;
    }
    if (!password || typeof password !== 'string' || password.length < 6) {
        res.status(400).json({ error: '密码至少需要 6 个字符' });
        return;
    }

    const safeName = sanitizeField(username.trim(), 50);
    if (!/^[\w\u4e00-\u9fa5\-]+$/.test(safeName)) {
        res.status(400).json({ error: '用户名只能包含字母、数字、中文、下划线和连字符' });
        return;
    }

    // 检查重名
    const existing = db.select({ id: users.id }).from(users).where(eq(users.username, safeName)).get();
    if (existing) {
        res.status(409).json({ error: '用户名已被使用' });
        return;
    }

    const hash = hashPassword(password);
    const display = sanitizeField(display_name || safeName, 100);

    const role: 'admin' | 'user' = 'user';
    const tokenNonce = crypto.randomBytes(8).toString('hex');

    const [user] = await (db.insert(users).values({
        username: safeName,
        displayName: display,
        passwordHash: hash,
        role,
        tokenNonce,
    }).returning({
        id: users.id, username: users.username, displayName: users.displayName,
        role: users.role, avatarUrl: users.avatarUrl, tokenNonce: users.tokenNonce, createdAt: users.createdAt,
    }));

    const token = createUserToken(user);

    res.cookie('session_token', token, {
        httpOnly: true,
        sameSite: 'lax',
        secure: isProd,
        maxAge: 24 * 60 * 60 * 1000,
        path: '/',
    });

    res.status(201).json({
        message: '注册成功',
        user: { id: user.id, username: user.username, displayName: user.displayName, role: user.role },
    });

    // 审计：注册
    audit('user.register', user.id, `用户注册: ${safeName}`, { role });
});

/**
 * 通过环境变量 ADMIN_USERNAME/ADMIN_PASSWORD 创建管理员账号。
 * 若该用户已存在则跳过，幂等安全。
 */
export async function ensureAdmin(username: string, password: string): Promise<void> {
    const existing = db.select({ id: users.id }).from(users).where(eq(users.username, username)).get();
    if (existing) {
        console.log(`👤 管理员 "${username}" 已存在，跳过初始化`);
        return;
    }

    const hash = hashPassword(password);
    const tokenNonce = crypto.randomBytes(8).toString('hex');

    db.insert(users).values({
        username,
        displayName: username,
        passwordHash: hash,
        role: 'admin',
        tokenNonce,
    }).run();

    console.log(`👑 管理员账号 "${username}" 已通过环境变量创建`);
    audit('admin.action', null, `管理员账号已通过环境变量初始化: ${username}`);
}

// ── 登录 ──

// 内存中登录尝试追踪：username → { count, lockedUntil }
const loginAttempts = new Map<string, { count: number; lockedUntil: number }>();

// 定期清理过期条目
setInterval(() => {
    const now = Date.now();
    for (const [key, val] of loginAttempts) {
        if (now > val.lockedUntil + LOCKOUT_DURATION_MS && now - val.lockedUntil > ATTEMPT_WINDOW_MS) {
            loginAttempts.delete(key);
        }
    }
}, 60 * 1000).unref();

// POST /api/auth/login - 使用用户名和密码登录
router.post('/login', (req: Request, res: Response) => {
    const { username, password } = req.body;

    if (!username || !password) {
        res.status(400).json({ error: '请输入用户名和密码' });
        return;
    }

    // 检查账号锁定（key 绑定 IP+用户名，防止恶意用户锁定他人账号）
    const clientIp = getClientIp(req);
    const key = `login:${hashIP(clientIp)}:${username}`;
    const attempt = loginAttempts.get(key);
    const now = Date.now();
    if (attempt && now < attempt.lockedUntil) {
        const remaining = Math.ceil((attempt.lockedUntil - now) / 1000 / 60);
        res.status(429).json({ error: `登录尝试过于频繁，请 ${remaining} 分钟后再试`, code: 'LOGIN_LOCKED' });
        audit('user.login', null, `登录失败: 账号 ${username} 已被锁定 ${remaining} 分钟`, { username, reason: 'locked', remainingMinutes: remaining });
        return;
    }

    const user = db.select().from(users).where(eq(users.username, username)).get();
    if (!user || !verifyPassword(password, user.passwordHash)) {
        // 记录失败尝试
        const willLock = attempt && attempt.count + 1 >= MAX_LOGIN_ATTEMPTS;
        if (attempt && now < attempt.lockedUntil + ATTEMPT_WINDOW_MS) {
            attempt.count++;
            if (attempt.count >= MAX_LOGIN_ATTEMPTS) {
                attempt.lockedUntil = now + LOCKOUT_DURATION_MS;
            }
        } else {
            // 首次失败：lockedUntil 设为 now（不锁定），仅在达到最大次数后才锁定
            loginAttempts.set(key, { count: 1, lockedUntil: now });
        }
        res.status(403).json({ error: '用户名或密码错误' });
        if (willLock) {
            audit('user.login', null, `登录失败: 账号 ${username} 已达最大尝试次数，已锁定 15 分钟`, { username, reason: 'locked', maxAttempts: MAX_LOGIN_ATTEMPTS });
        } else {
            audit('user.login', null, `登录失败: 用户名或密码错误 (${username})`, { username, reason: 'wrong_credentials', attemptCount: (attempt?.count ?? 1) });
        }
        return;
    }

    // 登录成功 — 清除尝试记录
    loginAttempts.delete(key);

    const token = createUserToken(user);

    res.cookie('session_token', token, {
        httpOnly: true,
        sameSite: 'lax',
        secure: isProd,
        maxAge: 24 * 60 * 60 * 1000,
        path: '/',
    });

    res.json({
        message: '登录成功',
        user: { id: user.id, username: user.username, displayName: user.displayName, role: user.role, avatarUrl: user.avatarUrl },
    });

    // 审计：登录
    audit('user.login', user.id, `用户登录: ${user.username}`);
});

// ── 登出 ──

// POST /api/auth/logout - 登出（使 token 失效）
router.post('/logout', requireAuth, (req: Request, res: Response) => {
    // 递增 tokenNonce 使该用户的所有现有 token 失效
    const payload = getCurrentUser(req)!;
    db.update(users).set({
        tokenNonce: crypto.randomBytes(8).toString('hex'),
    }).where(eq(users.id, payload.userId!)).run();

    res.clearCookie('session_token', { path: '/' });
    res.json({ message: '已退出登录' });

    // 审计：登出
    audit('user.logout', payload.userId!, `用户登出: ${payload.username}`);
});

// ── 状态与个人资料 ──

// GET /api/auth/status - 检查登录状态并返回当前用户
router.get('/status', (_req: Request, res: Response) => {
    const token = _req.cookies?.session_token;

    if (!token) {
        res.json({ authenticated: false, user: null });
        return;
    }

    const payload = verifyToken(token);
    if (!payload || !payload.userId) {
        res.json({ authenticated: false, user: null });
        return;
    }

    const user = db.select({
        id: users.id, username: users.username, displayName: users.displayName,
        role: users.role, avatarUrl: users.avatarUrl,
    }).from(users).where(eq(users.id, payload.userId)).get();

    if (!user) {
        res.json({ authenticated: false, user: null });
        return;
    }

    // token 即将过期时续期（滚动会话）
    renewTokenIfNeeded(payload, res);

    res.json({
        authenticated: true,
        user: { id: user.id, username: user.username, displayName: user.displayName, role: user.role, avatarUrl: user.avatarUrl },
    });
});

// GET /api/auth/me - 获取当前用户资料（需已登录）
router.get('/me', requireAuth, (req: Request, res: Response) => {
    const current = getCurrentUser(req)!;
    const userId = current.userId!;
    const user = db.select({
        id: users.id, username: users.username, displayName: users.displayName,
        role: users.role, avatarUrl: users.avatarUrl, createdAt: users.createdAt,
    }).from(users).where(eq(users.id, userId)).get();

    // 统计用户的脚本数
    const [{ count: scriptCount }] = db.select({ count: count() }).from(scripts)
        .where(eq(scripts.userId, userId)).all();

    res.json({ user: { ...user, scriptCount: scriptCount } });
});

// PUT /api/auth/me - 更新当前用户资料（需已登录）
router.put('/me', requireAuth, (req: Request, res: Response) => {
    const current = getCurrentUser(req)!;
    const userId = current.userId!;
    const { displayName } = req.body;

    const updateData: Record<string, string> = {};
    if (displayName !== undefined) {
        const safeName = sanitizeField(displayName, 50);
        updateData.displayName = safeName;
    }

    if (Object.keys(updateData).length === 0) {
        res.status(400).json({ error: '没有需要更新的字段' });
        return;
    }

    db.update(users).set(updateData).where(eq(users.id, userId)).run();
    audit('user.update_profile', userId, `用户 #${userId} 更新了个人资料`);

    const updated = db.select({
        id: users.id, username: users.username, displayName: users.displayName,
        role: users.role, avatarUrl: users.avatarUrl, createdAt: users.createdAt,
    }).from(users).where(eq(users.id, userId)).get();

    const [{ count: scriptCount }] = db.select({ count: count() }).from(scripts)
        .where(eq(scripts.userId, userId)).all();

    res.json({ user: { ...updated, scriptCount } });
});

// POST /api/auth/change-password - 修改密码（需已登录）
router.post('/change-password', requireAuth, (req: Request, res: Response) => {
    const current = getCurrentUser(req)!;
    const userId = current.userId!;
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
        res.status(400).json({ error: '请提供当前密码和新密码' });
        return;
    }
    if (typeof newPassword !== 'string' || newPassword.length < 6) {
        res.status(400).json({ error: '新密码至少需要 6 个字符' });
        return;
    }

    const user = db.select({ passwordHash: users.passwordHash })
        .from(users).where(eq(users.id, userId)).get();
    if (!user) {
        res.status(404).json({ error: '用户不存在' });
        return;
    }

    if (!verifyPassword(currentPassword, user.passwordHash)) {
        res.status(403).json({ error: '当前密码错误' });
        return;
    }

    const hashed = hashPassword(newPassword);
    db.update(users).set({ passwordHash: hashed }).where(eq(users.id, userId)).run();
    audit('user.change_password', userId, `用户 #${userId} 修改了密码`);

    res.json({ message: '密码已更新' });
});

// GET /api/users/:id - 查看用户的公开资料
router.get('/users/:id', (req: Request, res: Response) => {
    const id = parseInt(String(req.params.id));
    if (isNaN(id)) {
        res.status(400).json({ error: '无效的用户 ID' });
        return;
    }

    const user = db.select({
        id: users.id, username: users.username, displayName: users.displayName,
        avatarUrl: users.avatarUrl, createdAt: users.createdAt,
    }).from(users).where(eq(users.id, id)).get();
    if (!user) {
        res.status(404).json({ error: '用户不存在' });
        return;
    }

    const [{ count: scriptCount }] = db.select({ count: count() }).from(scripts)
        .where(eq(scripts.userId, id)).all();
    res.json({ user: { ...user, scriptCount: scriptCount } });
});

export default router;
