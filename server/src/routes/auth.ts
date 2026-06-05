import { Router, Request, Response } from 'express';
import { db } from '../db';
import { users, scripts } from '../db';
import { eq, count } from 'drizzle-orm';
import { requireAuth, createUserToken, verifyToken, hashPassword, verifyPassword, getCurrentUser } from '../middleware/auth';
import { sanitizeField, FIELD_LIMITS } from '../utils/validate';
import { audit } from '../utils/audit';
import { logVisitorEvent } from '../utils/risk';
import cap from '../utils/cap';
import { isProd } from '../config';

const router = Router();

// ── Register ──

// POST /api/auth/register - Create a new account (requires captcha)
router.post('/register', async (req: Request, res: Response) => {
    const { username, password, displayName: display_name, captchaToken: captcha_token, captchaAnswer: captcha_answer, envScore: env_score, envLabel: env_label, isBot: is_bot, visitorId: visitor_id, fpConfidence: fp_confidence } = req.body;

    // Verify Cap token (skip for first-ever registration for convenience)
    const [{ count: userCount }] = db.select({ count: count() }).from(users).all();
    if (userCount > 0) {
        // captcha_token is the Cap verification token, captcha_answer is unused
        const capToken = captcha_token || req.body.cap_token;
        if (!capToken) {
            res.status(400).json({ error: '请完成验证码', code: 'CAPTCHA_REQUIRED' });
            return;
        }
        const result = await cap.validateToken(capToken);
        if (!result.success) {
            res.status(400).json({ error: '验证码错误', code: 'CAPTCHA_WRONG' });
            return;
        }
        // Consume token (one-time use) - we don't delete it here to avoid race conditions;
        // validateToken already checks and the token expires naturally
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

    // Check duplicate
    const existing = db.select({ id: users.id }).from(users).where(eq(users.username, safeName)).get();
    if (existing) {
        res.status(409).json({ error: '用户名已被使用' });
        return;
    }

    const hash = hashPassword(password);
    const display = sanitizeField(display_name || safeName, 100);

    // First user to register becomes admin
    const role = userCount === 0 ? 'admin' : 'user';

    // Store environment detection info
    const envInfo = JSON.stringify({
        score: typeof env_score === 'number' ? env_score : null,
        label: typeof env_label === 'string' ? env_label : '',
        isBot: is_bot === true,
        visitorId: typeof visitor_id === 'string' ? visitor_id : null,
        fpConfidence: typeof fp_confidence === 'number' ? fp_confidence : null,
        detectedAt: new Date().toISOString(),
    });

    // Log registration attempt for visitor risk tracking
    if (typeof visitor_id === 'string') {
        logVisitorEvent({
            visitorId: visitor_id,
            action: 'register_attempt',
            envScore: typeof env_score === 'number' ? env_score : undefined,
            fpConfidence: typeof fp_confidence === 'number' ? fp_confidence : undefined,
            metadata: { username: safeName, role },
        });
    }

    const [user] = await (db.insert(users).values({
        username: safeName,
        displayName: display,
        passwordHash: hash,
        role,
        envInfo,
    }).returning({
        id: users.id, username: users.username, displayName: users.displayName,
        role: users.role, avatarUrl: users.avatarUrl, createdAt: users.createdAt,
    }) as any);

    const token = createUserToken(user);

    res.cookie('session_token', token, {
        httpOnly: true,
        sameSite: 'lax',
        secure: isProd,
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
        path: '/',
    });

    res.status(201).json({
        message: '注册成功',
        user: { id: user.id, username: user.username, displayName: user.displayName, role: user.role },
    });

    // Audit: registration
    audit('user.register', user.id, `用户注册: ${safeName}`, {
        role,
        envScore: typeof env_score === 'number' ? env_score : null,
        envLabel: typeof env_label === 'string' ? env_label : null,
        isBot: is_bot === true,
        visitorId: typeof visitor_id === 'string' ? visitor_id : null,
        fpConfidence: typeof fp_confidence === 'number' ? fp_confidence : null,
    });
});

// ── Login ──

// In-memory login attempt tracking: username → { count, lockedUntil }
const loginAttempts = new Map<string, { count: number; lockedUntil: number }>();
const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes
const ATTEMPT_WINDOW_MS = 30 * 60 * 1000; // reset counter after 30 min of no activity

// Cleanup stale entries periodically
setInterval(() => {
    const now = Date.now();
    for (const [key, val] of loginAttempts) {
        if (now > val.lockedUntil + LOCKOUT_DURATION_MS && now - val.lockedUntil > ATTEMPT_WINDOW_MS) {
            loginAttempts.delete(key);
        }
    }
}, 60 * 1000).unref();

// POST /api/auth/login - Login with username & password
router.post('/login', (req: Request, res: Response) => {
    const { username, password } = req.body;

    if (!username || !password) {
        res.status(400).json({ error: '请输入用户名和密码' });
        return;
    }

    // Check account lockout
    const key = `login:${username}`;
    const attempt = loginAttempts.get(key);
    const now = Date.now();
    if (attempt && now < attempt.lockedUntil) {
        const remaining = Math.ceil((attempt.lockedUntil - now) / 1000 / 60);
        res.status(429).json({ error: `登录尝试过于频繁，请 ${remaining} 分钟后再试`, code: 'LOGIN_LOCKED' });
        return;
    }

    const user = db.select().from(users).where(eq(users.username, username)).get() as any;
    if (!user || !verifyPassword(password, user.passwordHash)) {
        // Record failed attempt
        if (attempt && now < attempt.lockedUntil + ATTEMPT_WINDOW_MS) {
            attempt.count++;
            if (attempt.count >= MAX_LOGIN_ATTEMPTS) {
                attempt.lockedUntil = now + LOCKOUT_DURATION_MS;
            }
        } else {
            loginAttempts.set(key, { count: 1, lockedUntil: now + LOCKOUT_DURATION_MS });
        }
        res.status(403).json({ error: '用户名或密码错误' });
        return;
    }

    // Successful login — clear attempt tracking
    loginAttempts.delete(key);

    const token = createUserToken(user);

    res.cookie('session_token', token, {
        httpOnly: true,
        sameSite: 'lax',
        secure: isProd,
        maxAge: 7 * 24 * 60 * 60 * 1000,
        path: '/',
    });

    res.json({
        message: '登录成功',
        user: { id: user.id, username: user.username, displayName: user.displayName, role: user.role, avatarUrl: user.avatarUrl },
    });

    // Audit: login
    audit('user.login', user.id, `用户登录: ${user.username}`);
});

// ── Logout ──

// POST /api/auth/logout
router.post('/logout', (_req: Request, res: Response) => {
    res.clearCookie('session_token', { path: '/' });
    res.json({ message: '已退出登录' });
});

// ── Status & Profile ──

// GET /api/auth/status - Check auth status & return current user
// Only includes `hasUsers: false` when no users exist (for first-registration warning).
// Once any user is registered, `hasUsers` is omitted to avoid leaking info.
router.get('/status', (_req: Request, res: Response) => {
    const [{ count: userCount }] = db.select({ count: count() }).from(users).all();
    const isFirstUser = userCount === 0;

    const token = _req.cookies?.session_token;
    const base: Record<string, any> = {};

    if (!isFirstUser) {
        base.hasUsers = true;
    }

    if (!token) {
        res.json({ authenticated: false, user: null, ...(isFirstUser ? { hasUsers: false } : {}) });
        return;
    }

    const payload = verifyToken(token);
    if (!payload || !payload.userId) {
        res.json({ authenticated: false, user: null, ...(isFirstUser ? { hasUsers: false } : {}) });
        return;
    }

    const user = db.select({
        id: users.id, username: users.username, displayName: users.displayName,
        role: users.role, avatarUrl: users.avatarUrl,
    }).from(users).where(eq(users.id, payload.userId)).get();

    if (!user) {
        res.json({ authenticated: false, user: null, ...(isFirstUser ? { hasUsers: false } : {}) });
        return;
    }

    res.json({
        authenticated: true,
        user: { id: user.id, username: user.username, displayName: user.displayName, role: user.role, avatarUrl: user.avatarUrl },
        ...(isFirstUser ? { hasUsers: false } : {}),
    });
});

// GET /api/auth/me - Get current user profile (requires auth)
router.get('/me', requireAuth, (req: Request, res: Response) => {
    const current = getCurrentUser(req)!;
    const userId = current.userId!;
    const user = db.select({
        id: users.id, username: users.username, displayName: users.displayName,
        role: users.role, avatarUrl: users.avatarUrl, createdAt: users.createdAt,
    }).from(users).where(eq(users.id, userId)).get() as any;

    // Count user's scripts
    const [{ count: scriptCount }] = db.select({ count: count() }).from(scripts)
        .where(eq(scripts.userId, userId)).all();

    res.json({ user: { ...user, scriptCount: scriptCount } });
});

// PUT /api/auth/me - Update current user profile (requires auth)
router.put('/me', requireAuth, (req: Request, res: Response) => {
    const current = getCurrentUser(req)!;
    const userId = current.userId!;
    const { displayName } = req.body;

    const updateData: any = {};
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
    }).from(users).where(eq(users.id, userId)).get() as any;

    const [{ count: scriptCount }] = db.select({ count: count() }).from(scripts)
        .where(eq(scripts.userId, userId)).all();

    res.json({ user: { ...updated, scriptCount } });
});

// POST /api/auth/change-password - Change password (requires auth)
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
        .from(users).where(eq(users.id, userId)).get() as any;
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

// GET /api/users/:id - View a user's public profile
router.get('/users/:id', (req: Request, res: Response) => {
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) {
        res.status(400).json({ error: '无效的用户 ID' });
        return;
    }

    const user = db.select({
        id: users.id, username: users.username, displayName: users.displayName,
        avatarUrl: users.avatarUrl, createdAt: users.createdAt,
    }).from(users).where(eq(users.id, id)).get() as any;
    if (!user) {
        res.status(404).json({ error: '用户不存在' });
        return;
    }

    const [{ count: scriptCount }] = db.select({ count: count() }).from(scripts)
        .where(eq(scripts.userId, id)).all();
    res.json({ user: { ...user, scriptCount: scriptCount } });
});

export default router;
