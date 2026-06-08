/**
 * Debug API — 仅在 DEBUG_ENABLED=true 时可用。
 * 提供生成测试数据和重置数据库的端点。
 */
import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { db } from '../db';
import { users, scripts, installLogs, updateLogs, auditLogs, webhookLogs, captchaChallenges, captchaTokens, ratings } from '../db';
import { eq, and, count, lte, gt, isNull } from 'drizzle-orm';
import { userRepo, scriptRepo, logRepo, auditRepo, webhookRepo, captchaRepo, ratingRepo } from '../db/repos';
import { createUserToken, createGuestToken, hashPassword, UserRow, getCurrentUser, optionalAuth, verifyToken } from '../middleware/auth';
import { sanitizeField, FIELD_LIMITS, isUsernameBlacklisted } from '../utils/validate';
import { PORT, ADMIN_USERNAME, ADMIN_PASSWORD, PASSWORD_ITERATIONS, DEBUG_SEED_TOTAL, isProd, TOKEN_DURATION_MS } from '../config';
import { ensureAdmin } from './auth';


const router = Router();

// ── 仅限本机中间件 ──
router.use((req: Request, res: Response, next) => {
    const ip = req.ip || req.socket.remoteAddress || '';
    const isLocal = ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1' || ip === 'localhost';
    if (!isLocal) {
        res.status(403).json({ error: 'Debug API 仅允许本地调用' });
        return;
    }
    next();
});

// ── 辅助函数 ──
const pick = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
const randInt = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;

const names = [
    'Ad Blocker Pro', 'Video Download Helper', 'Page Dark Mode',
    'Auto Scroll', 'Link Cleaner', 'Image Zoom Plus',
    'Tab Manager', 'Form Filler', 'Password Revealer',
    'Cookie Editor', 'User Switcher', 'Style Customizer',
    'Script Runner', 'AJAX Debugger', 'DOM Inspector',
    'Color Picker', 'Font Changer', 'Layout Tester',
    'Cache Cleaner', 'Session Saver', 'Bookmark Organizer',
    'Search Enhancer', 'Dictionary Lookup', 'Translate Helper',
    'Price Tracker', 'Coupon Finder', 'Deal Alert',
    'News Aggregator', 'RSS Reader', 'Social Share',
    'Tweet Scheduler', 'Instagram Downloader', 'Reddit Enhancer',
    'YouTube Comments', 'Twitch Emotes', 'GitHub Helper',
    'Code Formatter', 'JSON Viewer', 'Regex Tester',
    'API Tester', 'WebSocket Monitor', 'Network Sniffer',
    'Performance Meter', 'Memory Usage', 'CPU Monitor',
    'Battery Saver', 'Screen Recorder', 'Screenshot Tool',
    'Tab Suspender', 'Focus Mode', 'Pomodoro Timer',
    'Todo List', 'Note Taking', 'Clipboard Manager',
    'Calculator', 'Unit Converter', 'Weather Widget',
    'Clock Widget', 'Calendar Helper', 'Countdown Timer',
    'iFrame Blocker', 'Pop-up Killer', 'Ad-block Helper',
    'Tracking Blocker', 'Privacy Guard', 'VPN Status',
    'Proxy Switcher', 'DNS Changer', 'IP Checker',
    'User-Agent Switcher', 'Geolocation Spoofer', 'Timezone Changer',
    'Language Detector', 'Text Counter', 'Case Converter',
    'Base64 Encoder', 'URL Encoder', 'Hash Generator',
    'Password Generator', 'QR Code Maker', 'Barcode Scanner',
];

const authors = [
    'dawn-lc', 'john_doe', 'script_master', 'code_wizard',
    'dev_guru', 'web_artist', 'byte_bender', 'pixel_pusher',
    'stack_surfer', 'loop_hero', 'null_ptr', 'async_await',
    'promise_king', 'callback_queen', 'regex_ranger',
    'css_ninja', 'flex_boxer', 'grid_master', 'hook_line',
    'state_less', 'effect_tive', 'redux_duck', 'saga_native',
];

const descriptions = [
    'Enhance your browsing experience with powerful tools',
    'A lightweight userscript for better web interaction',
    'Improve productivity and automate repetitive tasks',
    'Customize the look and feel of your favorite websites',
    'Add missing features to popular web applications',
    'Streamline your workflow with this handy utility',
    'Block annoying elements and focus on what matters',
    'Speed up your daily browsing routine',
    'Advanced tools for power users and developers',
    'Simple yet effective solution for common web issues',
    'Take control of your browser with this script',
    'Optimize your web experience with smart automation',
    'Essential toolkit for modern web browsing',
    'Boost your efficiency with intelligent features',
    'Your daily companion for better web navigation',
];

const namespaces = [
    'http://tampermonkey.net/', 'https://greasyfork.org/',
    'https://openuserjs.org/', 'http://localhost/',
];

const matchPatterns = [
    'https://*.example.com/*', 'https://*.github.com/*',
    'https://*.youtube.com/*', 'https://*.reddit.com/*',
    'https://*.twitter.com/*', 'https://*.stackoverflow.com/*',
    'https://*.medium.com/*', 'https://*.wikipedia.org/*',
];

const grantList = [
    'GM_getValue', 'GM_setValue', 'GM_deleteValue',
    'GM_listValues', 'GM_addValueChangeListener',
    'GM_notification', 'GM_setClipboard',
    'GM_xmlhttpRequest', 'GM_openInTab',
    'GM_registerMenuCommand', 'GM_addStyle', 'GM_log', 'GM_info',
];

function generateCode(name: string): string {
    return `// ==UserScript==\n// @name         ${name}\n// @namespace    ${pick(namespaces)}\n// @version      ${randInt(1, 5)}.${randInt(0, 20)}.${randInt(0, 999)}\n// @description  ${pick(descriptions)}\n// @author       ${pick(authors)}\n// @match        ${pick(matchPatterns)}\n// @grant        ${pick(grantList)}\n// ==/UserScript==\n\n(function() {\n    \'use strict\';\n    console.log(\'${name} loaded\');\n})();`;
}

// ── 模拟操作 ──

// POST /api/debug/login-as - 以指定用户身份登录（返回 session token）
router.post('/login-as', async (req: Request, res: Response) => {
    const { userId, username } = req.body;
    if (!userId && !username) {
        res.status(400).json({ error: '请提供 userId 或 username' });
        return;
    }

    const user = userId
        ? await userRepo.findById(parseInt(userId))
        : await userRepo.findByUsername(username);

    if (!user) {
        res.status(404).json({ error: '用户不存在' });
        return;
    }

    const token = createUserToken(user);
    // 实际设置 cookie（覆盖 ensureGuestToken 设置的访客 token）
    res.cookie('session_token', token, {
        httpOnly: true,
        sameSite: 'lax',
        secure: isProd,
        maxAge: TOKEN_DURATION_MS,
        path: '/',
    });
    res.json({
        message: `已模拟登录为 ${user.username} (${user.role})`,
        userId: user.id,
        role: user.role,
        token,
        cookie: `session_token=${token}; HttpOnly; Path=/`,
    });

});

// POST /api/debug/create-user - 创建测试用户
router.post('/create-user', async (req: Request, res: Response) => {
    const { username, password, role } = req.body;
    const safeName = sanitizeField((username || `test_${Date.now()}`).trim(), 50);
    const safePassword = password || 'test123';

    const existing = await userRepo.findIdByUsername(safeName);
    if (existing) {
        res.status(409).json({ error: '用户名已存在', userId: existing.id });
        return;
    }

    // 检查黑名单（debug API 也遵循同名规则）
    if (isUsernameBlacklisted(safeName)) {
        res.status(400).json({ error: '该用户名不可用' });
        return;
    }

    const hash = hashPassword(safePassword);
    const tokenNonce = crypto.randomBytes(8).toString('hex');
    const userRole = role === 'admin' ? 'admin' : 'user';

    const [created] = await db.insert(users).values({
        username: safeName,
        displayName: safeName,
        passwordHash: hash,
        role: userRole,
        tokenNonce,
    }).returning({ id: users.id, username: users.username, role: users.role });

    res.status(201).json({
        message: `用户 ${safeName} 已创建`,
        user: created,
        credentials: { username: safeName, password: safePassword },
    });

});

// POST /api/debug/create-script - 通过真实 API 模拟用户上传脚本（全流程）
router.post('/create-script', async (req: Request, res: Response) => {
    const { name, userId, readme } = req.body;
    if (!userId) {
        res.status(400).json({ error: '请提供 userId（脚本所有者）' });
        return;
    }

    const owner = await userRepo.findById(parseInt(userId));
    if (!owner) {
        res.status(404).json({ error: '用户不存在' });
        return;
    }

    const scriptName = sanitizeField(name || `Test Script ${Date.now()}`, FIELD_LIMITS.name);
    const safeName = scriptName.replace(/\s+/g, '-');

    // 生成完整的 UserScript 元数据，模拟真实用户编写的脚本
    const code = `// ==UserScript==
// @name         ${scriptName}
// @namespace    http://localhost/debug/
// @version      1.0.0
// @description  由 Debug API 模拟用户创建的测试脚本
// @author       ${owner.username}
// @match        https://*/*
// @match        http://*/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_notification
// @grant        GM_xmlhttpRequest
// @icon         https://www.google.com/s2/favicons?domain=example.com
// @supportURL   https://github.com/example/script/issues
// ==/UserScript==

(function() {
    'use strict';
    console.log('${scriptName} loaded');
})();`;

    // 生成 session token 模拟真实登录状态
    const token = createUserToken(owner);

    try {
        const apiResp = await fetch(`http://localhost:${PORT}/api/scripts`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Cookie': `session_token=${token}`,
            },
            body: JSON.stringify({
                code,
                filename: `${safeName}.user.js`,
                readme: readme || `# ${scriptName}\n\n由 Debug API 通过真实上传流程创建的测试脚本。`,
            }),
        });
        const result = await apiResp.json() as Record<string, unknown>;
        res.status(apiResp.status).json({
            ...result,
            _via: 'POST /api/scripts (real API — metadata validation, duplicate check, rate limit)',
        });
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        res.status(500).json({ error: `模拟创建脚本失败: ${msg}` });
    }
});

// POST /api/debug/rate - 通过真实 API 为脚本评分
router.post('/rate', async (req: Request, res: Response) => {
    const { scriptId, userId, score } = req.body;
    if (!scriptId || !userId || !score) {
        res.status(400).json({ error: '请提供 scriptId、userId 和 score（1-5）' });
        return;
    }

    const s = parseInt(score);
    if (s < 1 || s > 5) {
        res.status(400).json({ error: '评分必须在 1-5 之间' });
        return;
    }

    const owner = await userRepo.findById(parseInt(userId));
    if (!owner) {
        res.status(404).json({ error: '用户不存在' });
        return;
    }

    // 生成 session token 模拟用户登录状态
    const token = createUserToken(owner);

    try {
        const apiResp = await fetch(`http://localhost:${PORT}/api/scripts/${scriptId}/rate`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Cookie': `session_token=${token}`,
            },
            body: JSON.stringify({ score: s }),
        });
        const result = await apiResp.json() as Record<string, unknown>;
        res.status(apiResp.status).json({
            ...result,
            _via: `POST /api/scripts/${scriptId}/rate (real API)`,
        });
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        res.status(500).json({ error: `模拟评分失败: ${msg}` });
    }
});

// POST /api/debug/simulate-install - 通过真实安装/更新端点模拟用户安装
router.post('/simulate-install', async (req: Request, res: Response) => {
    const { scriptId, count = 1, asUpdate, channel } = req.body;
    if (!scriptId) {
        res.status(400).json({ error: '请提供 scriptId' });
        return;
    }

    const sid = parseInt(scriptId);
    // channel 为空时使用无前缀路由（/install），否则使用 /stable/ 或 /canary/
    const endpoint = channel
        ? (asUpdate ? `/api/scripts/${sid}/${channel}/update` : `/api/scripts/${sid}/${channel}/install`)
        : (asUpdate ? `/api/scripts/${sid}/update` : `/api/scripts/${sid}/install`);

    let successCount = 0;
    const maxCalls = Math.min(count, 100); // 限制并发数

    const tasks = [];
    for (let i = 0; i < maxCalls; i++) {
        tasks.push(
            fetch(`http://localhost:${PORT}${endpoint}`, {
                headers: {
                    'User-Agent': `Mozilla/5.0 (Debug Simulator ${i}) Chrome/120.0.0.0`,
                    'X-Forwarded-For': `192.168.${randInt(0, 255)}.${randInt(1, 254)}`,
                },
            }).then(r => {
                if (r.ok) successCount++;
                return r.text();
            }).catch(() => {/* 单个请求失败不影响整体 */ })
        );
    }

    await Promise.all(tasks);

    res.json({
        message: `通过真实 ${asUpdate ? 'update' : 'install'} 端点模拟 ${maxCalls} 次请求，成功 ${successCount} 次`,
        type: asUpdate ? 'update' : 'install',
        requested: maxCalls,
        succeeded: successCount,
        endpoint,
        _via: `GET ${endpoint} (real API)`,
    });
});

// POST /api/debug/simulate-traffic - 调用真实 API 生成综合流量
router.post('/simulate-traffic', async (req: Request, res: Response) => {
    const { installCount = 10, updateCount = 10, ratingCount = 5 } = req.body;

    const allUsers = await db.select({ id: users.id, username: users.username, role: users.role, tokenNonce: users.tokenNonce }).from(users);
    const allScripts = await scriptRepo.findAllIds();

    if (allScripts.length === 0 || allUsers.length === 0) {
        res.status(400).json({ error: '请先确保数据库中有用户和脚本' });
        return;
    }

    let installOk = 0;
    let updateOk = 0;
    let ratingOk = 0;
    const baseUrl = `http://localhost:${PORT}`;

    // 并发调用安装端点
    const installTasks = [];
    for (let i = 0; i < installCount; i++) {
        const script = pick(allScripts);
        installTasks.push(
            fetch(`${baseUrl}/api/scripts/${script.id}/install`, {
                headers: {
                    'User-Agent': `Mozilla/5.0 (Traffic Sim ${i})`,
                    'X-Forwarded-For': `10.0.${randInt(0, 255)}.${randInt(1, 254)}`,
                },
            }).then(r => { if (r.ok) installOk++; }).catch(() => { })
        );
    }
    await Promise.all(installTasks);

    // 并发调用更新端点
    const updateTasks = [];
    for (let i = 0; i < updateCount; i++) {
        const script = pick(allScripts);
        updateTasks.push(
            fetch(`${baseUrl}/api/scripts/${script.id}/update`, {
                headers: {
                    'X-Forwarded-For': `10.0.${randInt(0, 255)}.${randInt(1, 254)}`,
                },
            }).then(r => { if (r.ok) updateOk++; }).catch(() => { })
        );
    }
    await Promise.all(updateTasks);

    // 评分（需要登录）
    const ratingTasks = [];
    for (let i = 0; i < Math.min(ratingCount, allUsers.length * allScripts.length); i++) {
        const user = pick(allUsers);
        const script = pick(allScripts);
        const token = createUserToken(user);
        const score = randInt(1, 5);
        ratingTasks.push(
            fetch(`${baseUrl}/api/scripts/${script.id}/rate`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Cookie': `session_token=${token}`,
                },
                body: JSON.stringify({ score }),
            }).then(r => { if (r.ok) ratingOk++; }).catch(() => { })
        );
    }
    await Promise.all(ratingTasks);

    res.json({
        message: '流量模拟完成（通过真实 API）',
        stats: {
            installCalls: installOk,
            updateCalls: updateOk,
            ratingSubmissions: ratingOk,
        },
        _via: 'GET /api/scripts/:id/install, GET /api/scripts/:id/update, POST /api/scripts/:id/rate (real APIs)',
    });
});

// ── 脚本诊断 ──

// GET /api/debug/script/:id - 查看脚本原始数据（含软删除）
router.get('/script/:id', async (req: Request, res: Response) => {
    const id = parseInt(String(req.params.id));
    if (isNaN(id)) { res.status(400).json({ error: '无效 ID' }); return; }

    // 1) 直接查询
    const [raw] = await db.select().from(scripts).where(eq(scripts.id, id));

    // 2) 测试 repo 层
    const withDeleted = await scriptRepo.findById(id, true);
    const withoutDeleted = await scriptRepo.findById(id, false);

    // 3) 手动构造 notDeleted 条件测试
    const notDeleted = isNull(scripts.deletedAt);
    const [byNotDeleted] = await db.select({ id: scripts.id, name: scripts.name, deletedAt: scripts.deletedAt })
        .from(scripts).where(and(notDeleted, eq(scripts.id, id)));

    const strip = (r: typeof raw) => r ? { id: r.id, name: r.name, version: r.version, deletedAt: r.deletedAt, installs: r.installs, updateChecks: r.updateChecks } : null;

    res.json({
        raw: strip(raw),
        repo: {
            withDeleted: withDeleted ? { id: withDeleted.id, name: withDeleted.name, deletedAt: withDeleted.deletedAt } : null,
            withoutDeleted: withoutDeleted ? { id: withoutDeleted.id, name: withoutDeleted.name, deletedAt: withoutDeleted.deletedAt } : null,
        },
        manualTest: {
            notDeletedFound: !!byNotDeleted,
            row: byNotDeleted ? { id: byNotDeleted.id, name: byNotDeleted.name, deletedAt: byNotDeleted.deletedAt } : null,
        },
        diagnostics: {
            rawExists: !!raw,
            repoWithDeletedWorks: !!withDeleted,
            repoWithoutDeletedWorks: !!withoutDeleted,
            manualNotDeletedWorks: !!byNotDeleted,
            rawDeletedAt: raw?.deletedAt ?? null,
            rawInstalls: raw?.installs ?? null,
        },
    });
});

// GET /api/debug/auth-status - 查看当前请求的认证状态
router.get('/auth-status', optionalAuth, (req: Request, res: Response) => {
    const user = getCurrentUser(req);
    const token = req.cookies?.session_token;
    let verifyResult: unknown = null;
    if (token) {
        const payload = verifyToken(token);
        verifyResult = payload ? { valid: true, userId: payload.userId, role: payload.role } : { valid: false };
    }
    res.json({
        hasUser: !!user,
        role: user?.role ?? null,
        userId: user?.userId ?? null,
        username: user?.username ?? null,
        cookies: token ? 'present' : 'missing',
        headers: req.headers.cookie ? 'present' : 'missing',
        verifyResult,
    });
});

// GET /api/debug/repo-search - 测试 scriptRepo.search 是否过滤已删除脚本
router.get('/repo-search', async (_req: Request, res: Response) => {
    const all = await scriptRepo.search({ limit: 5, offset: 0 });
    const ids = all.items.map(s => s.id);
    const status = await Promise.all(ids.map(async (id: number) => {
        const [row] = await db.select({ id: scripts.id, name: scripts.name, deletedAt: scripts.deletedAt })
            .from(scripts).where(eq(scripts.id, id));
        return { id, name: row?.name, deletedAt: row?.deletedAt ?? null };
    }));
    res.json({
        firstFiveIds: ids,
        deletedStatus: status,
        deletedInResult: status.filter(s => s.deletedAt !== null).map(s => s.id),
        total: all.total,
    });
});

// ── 数据库统计 ──

// GET /api/debug/stats - 各表行数
router.get('/stats', async (_req: Request, res: Response) => {
    const [usersCount, scriptsCount, installsCount, updatesCount,
        auditsCount, webhooksCount, challengesCount, tokensCount, ratingsCount] = await Promise.all([
            userRepo.count(), scriptRepo.count(), logRepo.countInstalls(), logRepo.countUpdates(),
            auditRepo.count(), webhookRepo.count(), captchaRepo.countActiveChallenges(),
            captchaRepo.countActiveTokens(), ratingRepo.count(),
        ]);
    res.json({
        users: usersCount, scripts: scriptsCount, installLogs: installsCount,
        updateLogs: updatesCount, auditLogs: auditsCount, webhookLogs: webhooksCount,
        captchaChallenges: challengesCount, captchaTokens: tokensCount, ratings: ratingsCount,
    });
});

// ── 验证码系统诊断 ──

// GET /api/debug/cap - 查看验证码挑战和 token 统计
router.get('/captcha', async (_req: Request, res: Response) => {
    const now = Date.now();
    const [activeChallenges, expiredChallenges, activeTokens, expiredTokens] = await Promise.all([
        captchaRepo.countActiveChallenges(),
        captchaRepo.countExpiredChallenges(),
        captchaRepo.countActiveTokens(),
        captchaRepo.countExpiredTokens(),
    ]);
    res.json({
        challenges: { active: activeChallenges, expired: expiredChallenges },
        tokens: { active: activeTokens, expired: expiredTokens },
    });
});

// POST /api/debug/cleanup - 手动触发过期挑战和 token 清理
router.post('/cleanup', async (_req: Request, res: Response) => {
    const now = Date.now();
    await captchaRepo.cleanupExpiredChallenges();
    await captchaRepo.cleanupExpiredTokens();

    res.json({
        message: '过期记录已清理',
    });

});

// ── 限流测试 ──

/**
 * POST /api/debug/test-rate-limit
 * 自动测试四级限流（无cookie < 访客 < 用户 < 管理员不限）。
 * 返回各等级的限流触发位置，便于验证限流配置是否正确。
 */
router.post('/test-rate-limit', async (_req: Request, res: Response) => {
    const baseUrl = `http://localhost:${PORT}`;
    const results: Record<string, { threshold: number; blockedAt: number | null; total: number; blocked: number }> = {};

    // 1. 无 cookie 测试（阈值 30）
    let blockedAt: number | null = null;
    let blocked = 0;
    for (let i = 1; i <= 35; i++) {
        const r = await fetch(`${baseUrl}/api/scripts?limit=1`);
        if (r.status === 429) {
            blocked++;
            if (blockedAt === null) blockedAt = i;
        }
    }
    results['no-cookie'] = { threshold: 30, blockedAt, total: 35, blocked };

    // 2. 访客 cookie 测试（阈值 60）
    // 直接用 createGuestToken 生成服务器签名的访客 token
    const guestToken = createGuestToken();
    blockedAt = null;
    blocked = 0;
    for (let i = 1; i <= 65; i++) {
        const r = await fetch(`${baseUrl}/api/scripts?limit=1`, {
            headers: { Cookie: `session_token=${guestToken}` },
        });
        if (r.status === 429) {
            blocked++;
            if (blockedAt === null) blockedAt = i;
        }
    }
    results['guest'] = { threshold: 60, blockedAt, total: 65, blocked };

    // 3. 普通用户测试（阈值 200）
    // 获取所有用户，选一个非 admin 的作为测试用户
    const allUsers = await db.select({ id: users.id, username: users.username, role: users.role, tokenNonce: users.tokenNonce })
        .from(users);  // 此处保留直接查询，因需要全量用户数据且字段选择特殊
    let testUser = allUsers.find(u => u.role === 'user');
    if (!testUser) {
        // 没有普通用户则创建一个
        const hash = hashPassword('test123');
        const tokenNonce = crypto.randomBytes(8).toString('hex');
        const [created] = await db.insert(users).values({
            username: 'ratelimit_test_user',
            displayName: 'Rate Limit Test',
            passwordHash: hash,
            role: 'user',
            tokenNonce,
        }).returning({ id: users.id, username: users.username, role: users.role, tokenNonce: users.tokenNonce });
        testUser = created;
    }
    // 经过上面的 if 判断，testUser 一定存在
    const userToken = createUserToken(testUser!);
    blockedAt = null;
    blocked = 0;
    for (let i = 1; i <= 205; i++) {
        const r = await fetch(`${baseUrl}/api/scripts?limit=1`, {
            headers: { Cookie: `session_token=${userToken}` },
        });
        if (r.status === 429) {
            blocked++;
            if (blockedAt === null) blockedAt = i;
        }
    }
    results['user'] = { threshold: 200, blockedAt, total: 205, blocked };

    // 4. 管理员测试（无限制）
    const admin = allUsers.find(u => u.role === 'admin');
    if (admin) {
        const adminToken = createUserToken(admin);
        blockedAt = null;
        blocked = 0;
        for (let i = 1; i <= 80; i++) {
            const r = await fetch(`${baseUrl}/api/scripts?limit=1`, {
                headers: { Cookie: `session_token=${adminToken}` },
            });
            if (r.status === 429) {
                blocked++;
                if (blockedAt === null) blockedAt = i;
            }
        }
        results['admin'] = { threshold: Infinity, blockedAt, total: 80, blocked };
    }

    // 判断各等级是否通过测试
    const verdict: Record<string, 'pass' | 'fail' | 'skip'> = {};
    for (const [key, r] of Object.entries(results)) {
        if (key === 'admin') {
            verdict[key] = r.blocked === 0 ? 'pass' : 'fail';
        } else {
            // 应该在 threshold 附近（±5）触发第一次限流
            const expected = r.threshold;
            verdict[key] = (r.blockedAt !== null && Math.abs(r.blockedAt - expected) <= 5) ? 'pass' : 'fail';
        }
    }

    res.json({
        message: '四级限流测试完成',
        results,
        verdict,
        summary: Object.entries(verdict).map(([k, v]) => `${k}: ${v}`).join(', '),
        _note: '无cookie=30, 访客=60, 用户=200, 管理员=无限制。测试消耗了各等级配额，需等待窗口重置或重启服务。',
    });
});

// ── 种子数据端点 ──

// POST /api/debug/seed - 通过真实 API 插入 测试脚本（触发限流时会自动停止，便于验证限流机制）
router.post('/seed', async (_req: Request, res: Response) => {
    // 统计已有脚本数
    const existingCount = await scriptRepo.count();
    if (existingCount > 0) {
        res.json({ message: `数据库中已有 ${existingCount} 条脚本，跳过填充。如需重新填充请先调用 /api/debug/reset` });
        return;
    }

    // 确保管理员用户存在，并创建一批测试用户用于分布脚本所有权
    const userCount = await userRepo.count();
    let adminId: number;
    if (userCount === 0) {
        const password = 'admin123';
        const salt = crypto.randomBytes(16).toString('hex');
        const hash = crypto.pbkdf2Sync(password, salt, PASSWORD_ITERATIONS, 64, 'sha512').toString('hex');
        const [newUser] = await (db.insert(users).values({
            username: 'admin',
            displayName: 'Admin',
            passwordHash: `${salt}:${hash}`,
            role: 'admin',
        }).returning({ id: users.id }));
        adminId = newUser.id;
    } else {
        const existing = await userRepo.findIdByUsername('admin');
        adminId = existing?.id || 1;
    }

    // 从 authors 列表中创建测试用户（已存在则跳过），用于脚本所有权分布
    const seedUsers: UserRow[] = [];
    for (const author of authors) {
        const [existing] = await db.select({ id: users.id, username: users.username, role: users.role, tokenNonce: users.tokenNonce })
            .from(users).where(eq(users.username, author));
        if (existing) {
            seedUsers.push(existing);
        } else {
            const hash = hashPassword('test123');
            const tokenNonce = crypto.randomBytes(8).toString('hex');
            const [created] = await db.insert(users).values({
                username: author,
                displayName: author,
                passwordHash: hash,
                role: 'user',
                tokenNonce,
            }).returning({ id: users.id, username: users.username, role: users.role, tokenNonce: users.tokenNonce });
            seedUsers.push(created);
        }
    }

    const admin = (await userRepo.findById(adminId))!;

    const TOTAL = DEBUG_SEED_TOTAL;
    let successCount = 0;
    let failCount = 0;
    const errors: string[] = [];

    for (let i = 0; i < TOTAL; i++) {
        const baseName = pick(names);
        const suffix = i > 0 ? ` #${i}` : '';
        const name = `${baseName}${suffix}`;
        const safeName = name.replace(/\s+/g, '-');
        const author = pick(authors);

        // 生成 UserScript 代码（同现有的 generateCode 逻辑）
        const code = `// ==UserScript==
// @name         ${name}
// @namespace    ${pick(namespaces)}
// @version      ${randInt(1, 5)}.${randInt(0, 20)}.${randInt(0, 999)}
// @description  ${pick(descriptions)}
// @author       ${author}
// @match        ${pick(matchPatterns)}
// @grant        ${pick(grantList)}
// ==/UserScript==

(function() {
    'use strict';
    console.log('${name} loaded');
})();`;

        // 随机选一个用户作为脚本所有者（80% 概率用测试用户，20% 概率用 admin）
        const owner = Math.random() < 0.8 ? pick(seedUsers) : admin;
        const token = createUserToken(owner);

        try {
            const apiResp = await fetch(`http://localhost:${PORT}/api/scripts`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Cookie': `session_token=${token}`,
                },
                body: JSON.stringify({
                    code,
                    filename: `${safeName}.user.js`,
                    readme: '',
                }),
            });

            const result = await apiResp.json() as Record<string, unknown>;

            if (apiResp.ok) {
                successCount++;
                if (successCount % 50 === 0) {
                    console.log(`  [seed] 进度: ${successCount} / ${TOTAL}（通过真实 API）`);
                }
            } else {
                failCount++;
                const errMsg = String(result.error || result.message || '未知错误');
                errors.push(`#${i} (${name}): ${errMsg}`);

                // 遇到限流或其他错误时停止
                if (apiResp.status === 429) {
                    console.log(`  [seed] ⛔ 触发限流，停止填充`);
                    break;
                }
            }
        } catch (err: unknown) {
            failCount++;
            const msg = err instanceof Error ? err.message : String(err);
            errors.push(`#${i} (${name}): ${msg}`);
            // 网络错误也停止
            break;
        }

        // 稍微延迟，避免短时间内过多请求
        if (i > 0 && i % 10 === 0) {
            await new Promise(r => setTimeout(r, 50));
        }
    }

    res.json({
        message: `通过真实 API 填充脚本：成功 ${successCount}，失败 ${failCount}${failCount > 0 ? `，首个错误: ${errors[0]}` : ''}`,
        stats: { success: successCount, fail: failCount },
        errors: errors.length > 0 ? errors.slice(0, 10) : undefined,
        usersCreated: seedUsers.length,
        testUserPassword: 'test123',
        adminUser: `admin / admin123`,
        _note: '脚本所有者按 80% 测试用户 + 20% admin 随机分布',
    });
});

// POST /api/debug/reset - 重置所有数据（自动重建管理员）
router.post('/reset', async (_req: Request, res: Response) => {
    // 按依赖顺序删除（子表先删，父表后删）
    await db.delete(installLogs);
    await db.delete(updateLogs);
    await ratingRepo.deleteAll();
    await db.delete(auditLogs);
    await db.delete(webhookLogs);
    await db.delete(captchaChallenges);
    await db.delete(captchaTokens);
    await db.delete(scripts);
    await db.delete(users);

    // 根据配置重建管理员账号
    if (ADMIN_USERNAME && ADMIN_PASSWORD) {
        await ensureAdmin(ADMIN_USERNAME, ADMIN_PASSWORD);
    }

    res.json({ message: '数据库已重置，管理员账号已重建' });

});

export default router;
