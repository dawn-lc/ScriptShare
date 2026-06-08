import { Router, Request, Response, NextFunction } from 'express';
import { getClientIp, hashIP } from '../utils/ip';
import { db } from '../db';
import { scripts, installLogs, updateLogs, ratings } from '../db';
import { eq, sql, count, like, or, and, asc, desc, isNull } from 'drizzle-orm';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { Script, ScriptListItem } from '../models/script';
import UAParser from 'ua-parser-js';
import { requireAuth, optionalAuth, getCurrentUser, getRequestRole, verifyToken } from '../middleware/auth';
import { audit } from '../utils/audit';

import {
    sanitizeField,
    sanitize,
    isValidCodeSize,
    generateSecret,
    FIELD_LIMITS,
    validateScriptMeta,
} from '../utils/validate';
import { SCRIPTS_WRITE_WINDOW_MS, SCRIPTS_WRITE_NO_COOKIE_MAX, SCRIPTS_WRITE_GUEST_MAX, SCRIPTS_WRITE_USER_MAX, README_MAX_LENGTH } from '../config';
import { scriptRepo, logRepo, ratingRepo } from '../db/repos';
import type { NewScript, ScriptUpdateData } from '../db/repos/script';



const router = Router();

// ── 共享辅助函数 ──

/** 解析并验证脚本 ID，无效时直接发送响应并返回 null */
function parseScriptId(req: Request, res: Response): number | null {
    const id = parseInt(String(req.params.id));
    if (isNaN(id)) { res.status(400).json({ error: '无效的脚本 ID' }); return null; }
    return id;
}

/** 获取登录用户信息（简化 getCurrentUser 调用） */
function getUser(req: Request): ReturnType<typeof getCurrentUser> {
    return getCurrentUser(req);
}

/** 检查当前用户是否为脚本所有者或管理员，否则发送 403 */
function checkOwnership(existing: { userId: number | null }, user: ReturnType<typeof getCurrentUser>, res: Response): boolean {
    if (existing.userId && user?.userId !== existing.userId && user?.role !== 'admin') {
        res.status(403).json({ error: '你没有权限执行此操作' });
        return false;
    }
    return true;
}

/** 从请求中提取用户信息（用于审计日志等场景） */
function extractUserInfo(req: Request): { userId: number | null; username: string | null } {
    const token = req.cookies?.session_token;
    if (!token) return { userId: null, username: null };
    const payload = verifyToken(token);
    if (!payload) return { userId: null, username: null };
    return {
        userId: (payload.userId !== null && payload.userId !== undefined) ? payload.userId : null,
        username: payload.username || null,
    };
}

/** 将 UserScript 元数据字段拆分为数组 */
function splitMeta(value: string | string[] | undefined): string[] {
    if (Array.isArray(value)) return value.map(v => sanitizeField(v, FIELD_LIMITS.metadata_line)).filter(Boolean);
    if (typeof value === 'string') return value.split(',').map(v => sanitizeField(v.trim(), FIELD_LIMITS.metadata_line)).filter(Boolean);
    return [];
}

/** 从 meta 构建脚本数据对象（共用字段映射，减少重复） */
function buildScriptData(meta: Partial<Script>, code: string, readme: string, extra: {
    filename: string;
    userId?: number | null;
    createdAt?: Date;
}): Record<string, unknown> {
    const data: Record<string, unknown> = {
        name: sanitizeField(meta.name || 'Untitled', FIELD_LIMITS.name),
        namespace: sanitizeField(meta.namespace || '', FIELD_LIMITS.namespace),
        version: sanitizeField(meta.version || '1.0.0', FIELD_LIMITS.version),
        description: sanitizeField(meta.description || '', FIELD_LIMITS.description),
        author: sanitizeField(meta.author || '', FIELD_LIMITS.author),
        icon: sanitizeField(meta.icon || '', FIELD_LIMITS.metadata_line),
        icon64: sanitizeField(meta.icon64 || '', FIELD_LIMITS.metadata_line),
        supportURL: sanitizeField(meta.supportURL || '', FIELD_LIMITS.metadata_line),
        grant: splitMeta(meta.grant),
        match: splitMeta(meta.match),
        exclude: splitMeta(meta.exclude),
        require: splitMeta(meta.require),
        resource: splitMeta(meta.resource),
        connect: splitMeta(meta.connect),
        code: sanitize(code),
        filename: extra.filename,
        readme: sanitizeField(readme, README_MAX_LENGTH),
        ...(extra.userId !== undefined ? { userId: extra.userId } : {}),
        i18n: meta.i18n || {},
        updatedAt: new Date(),
    };
    if (extra.createdAt) data.createdAt = extra.createdAt;
    return data;
}

/** 发送 UserScript 代码响应（统一处理 Content-Type / Content-Disposition） */
function sendScriptCode(res: Response, code: string, filename: string, disposition: 'inline' | 'attachment' = 'inline'): void {
    res.setHeader('Content-Type', 'text/javascript; charset=utf-8');
    res.setHeader('Content-Disposition', `${disposition}; filename="${filename}"`);
    res.send(code);
}

/** 记录脚本安装日志（含 UA 解析、安装计数、审计） */
function logInstall(scriptId: number, req: Request, channel?: string): void {
    const ip = getClientIp(req);
    const ua = req.headers['user-agent'] || '';
    const parser = new UAParser(ua);
    const browserInfo = parser.getBrowser();
    const osInfo = parser.getOS();
    const deviceInfo = parser.getDevice();
    const ipHash = hashIP(ip);

    logRepo.createInstall({
        scriptId,
        ipHash,
        userAgent: ua,
        browser: `${browserInfo.name || ''} ${browserInfo.version || ''}`.trim(),
        os: `${osInfo.name || ''} ${osInfo.version || ''}`.trim(),
        device: deviceInfo.type || 'desktop',
    }).catch(() => { });

    scriptRepo.incrementInstalls(scriptId).catch(() => { });

    audit('script.install', null, `安装脚本 (ID=${scriptId})${channel ? ' [' + channel + ']' : ''}`, { scriptId, channel });
}

// 写操作限流（四级：无cookie < 访客 < 用户 < 管理员不限；各级独立计数器）
const writeLimiter = rateLimit({
    windowMs: SCRIPTS_WRITE_WINDOW_MS,
    skip: (req) => getRequestRole(req) === 'admin',
    max: (req) => {
        const role = getRequestRole(req);
        if (role === 'user') return SCRIPTS_WRITE_USER_MAX;
        if (role === 'guest') return SCRIPTS_WRITE_GUEST_MAX;
        return SCRIPTS_WRITE_NO_COOKIE_MAX;
    },
    keyGenerator: (req) => {
        const role = getRequestRole(req);
        if (role === 'user') {
            const token = req.cookies?.session_token;
            if (token) {
                const payload = verifyToken(token);
                if (payload && payload.userId !== null && payload.userId !== undefined) {
                    return `write:user:${payload.userId}`;
                }
            }
        }
        if (role === 'guest') {
            const token = req.cookies?.session_token;
            if (token) return `write:guest:${token}`;
        }
        return ipKeyGenerator(req.ip || req.socket.remoteAddress || 'unknown');
    },
    standardHeaders: true,
    handler: (req, res) => {
        const role = getRequestRole(req);
        const { userId, username } = extractUserInfo(req);
        const clientIp = req.ip || req.socket.remoteAddress || '';
        const who = username ? `${username}(userId=${userId})` : `[${role}]`;
        audit('rate_limit.exceeded', userId, `写操作限流 ${req.method} ${req.path} ${who} ${clientIp}`, {
            role,
            ip: clientIp,
            username,
        });
        res.status(429).json({ error: '操作过于频繁，请稍后再试' });
    },
    legacyHeaders: false,
    message: { error: '操作过于频繁，请稍后再试' },
});



// ── 上传后元数据检测 ──



// GET /api/scripts - 获取脚本列表
router.get('/', optionalAuth, async (req: Request, res: Response) => {
    const page = parseInt(String(req.query.page ?? '')) || 1;
    const limit = parseInt(String(req.query.limit ?? '')) || 20;
    const offset = (page - 1) * limit;
    const search = String(req.query.search ?? '');
    const sort = String(req.query.sort ?? 'updatedAt');
    const user = getCurrentUser(req);
    const isAdmin = user?.role === 'admin';

    const sortMap: Record<string, import('drizzle-orm').AnyColumn> = {
        updatedAt: scripts.updatedAt,
        createdAt: scripts.createdAt,
        installs: scripts.installs,
        name: scripts.name,
        updateChecks: scripts.updateChecks,
    };
    const sortCol = sortMap[sort] || scripts.updatedAt;
    const sortDirFn = req.query.order === 'asc' ? asc : desc;

    // 构建搜索条件（管理员可看到已删除脚本）
    const conditions: import('drizzle-orm').SQL[] = [];
    if (!isAdmin) conditions.push(isNull(scripts.deletedAt));
    if (search) {
        conditions.push(or(
            like(scripts.name, `%${search}%`),
            like(scripts.description, `%${search}%`),
            like(scripts.author, `%${search}%`),
        )!);
    }
    const whereClause = conditions.length > 1 ? and(...conditions) : conditions[0] ?? sql`TRUE`;

    const [{ total }] = await db.select({ total: count() }).from(scripts).where(whereClause);

    const scriptRows = await db.select({
        id: scripts.id, name: scripts.name, namespace: scripts.namespace,
        version: scripts.version, description: scripts.description, author: scripts.author,
        icon: scripts.icon, icon64: scripts.icon64,
        installs: scripts.installs, updateChecks: scripts.updateChecks,
        createdAt: scripts.createdAt, updatedAt: scripts.updatedAt,
        i18n: scripts.i18n,
        supportURL: scripts.supportURL,
        ...(isAdmin ? { deletedAt: scripts.deletedAt } : {}),
    } as const).from(scripts)
        .where(whereClause)
        .orderBy(sortDirFn(sortCol))
        .limit(limit)
        .offset(offset);
    const totalPages = Math.ceil(total / limit);

    // 附加评分数据
    const scriptIds = scriptRows.map(s => s.id);
    const ratingMap = new Map<number, { avg: number; cnt: number }>();
    if (scriptIds.length > 0) {
        const ratingsData = await ratingRepo.getAverageByScriptIds(scriptIds);
        for (const r of ratingsData) {
            ratingMap.set(r.scriptId, { avg: Math.round(Number(r.average) * 10) / 10, cnt: r.count });
        }
    }

    // 构建含评分的脚本列表（用 map 创建新对象以保留完整类型）
    const scriptList = scriptRows.map(s => {
        const r = ratingMap.get(s.id);
        return { ...s, rating: r ? r.avg : 0, ratingCount: r ? r.cnt : 0 };
    });

    res.json({
        scripts: scriptList,
        pagination: {
            page,
            limit,
            total,
            totalPages: totalPages,
            hasNext: page < totalPages,
            hasPrev: page > 1,
        },
    });
});

// GET /api/scripts/:id - 获取脚本详情
router.get('/:id', optionalAuth, async (req: Request, res: Response) => {
    const id = parseInt(String(req.params.id));
    if (isNaN(id)) {
        res.status(400).json({ error: '无效的脚本 ID' });
        return;
    }

    const user = getCurrentUser(req);
    const script = await scriptRepo.findById(id, user?.role === 'admin');

    if (!script) {
        res.status(404).json({ error: '脚本不存在' });
        return;
    }

    // 附加评分数据
    const ratingStats = await scriptRepo.getRatingStats(id);
    const scriptWithRating = {
        ...script,
        rating: ratingStats.avg ?? 0,
        ratingCount: ratingStats.count,
    };

    res.json({ script: scriptWithRating });
});

/**
 * 根据频道解析要提供的代码和版本号。
 * 频道来自 URL 路径：/stable/ 或 /canary/
 */
function resolveScriptChannel(row: { code?: string | null; canaryCode?: string | null; version?: string | null; canaryVersion?: string | null }, channel: string): { code: string; version: string } {
    if (channel === 'canary' && row.canaryCode) {
        return { code: row.canaryCode, version: row.canaryVersion || row.version || '0.0.0' };
    }
    return { code: row.code || '', version: row.version || '0.0.0' };
}

/** 从路由参数或 locals 中提取频道（默认 stable） */
function getChannel(req: Request, res?: Response): string {
    const fromParams = req.params.channel;
    const channel = Array.isArray(fromParams) ? fromParams[0] : fromParams;
    return channel || String(res?.locals?.channel ?? '') || 'stable';
}

// ── 频道路由辅助 ──
// 从 URL 中去除 :channel 段，使 Express 重新匹配到通用处理器。
// 在 Express 重新匹配并覆盖 req.params 之前，将频道保存到 res.locals。
function channelRoute() {
    return (req: Request, res: Response, next: NextFunction) => {
        const channel = req.params.channel;
        if (channel) {
            res.locals.channel = channel;
            req.url = req.url.replace(`/${channel}`, '');
        }
        next();
    };
}

// 频道路由（必须在通用 /:id/ 路由之前）
router.get('/:id/:channel(stable|canary)/code', channelRoute());
router.get('/:id/:channel(stable|canary)/install', channelRoute());
router.get('/:id/:channel(stable|canary)/update', channelRoute());
router.get('/:id/:channel(stable|canary)/check-update', channelRoute());
router.get('/:id/:channel(stable|canary)/script.user.js', channelRoute());

// GET /api/scripts/:id/code - 获取脚本原始代码
router.get('/:id/code', async (req: Request, res: Response) => {
    const id = parseInt(String(req.params.id));
    if (isNaN(id)) {
        res.status(400).json({ error: '无效的脚本 ID' });
        return;
    }

    const channel = getChannel(req, res);
    const row = await scriptRepo.findByIdColumns(id, { code: true, canaryCode: true, filename: true });
    if (!row) {
        res.status(404).json({ error: '脚本不存在' });
        return;
    }

    const { code } = resolveScriptChannel(row, channel);
    sendScriptCode(res, code, row.filename || `script-${id}.user.js`);
});

// GET /api/scripts/:id/install - 安装脚本
router.get('/:id/install', async (req: Request, res: Response) => {
    const id = parseScriptId(req, res);
    if (id === null) return;

    const channel = getChannel(req, res);
    const row = await scriptRepo.findByIdColumns(id, { id: true, code: true, canaryCode: true, canaryVersion: true, filename: true, version: true });
    if (!row) {
        res.status(404).json({ error: '脚本不存在' });
        return;
    }

    logInstall(id, req, channel);

    const { code } = resolveScriptChannel(row, channel);
    sendScriptCode(res, code, row.filename || `script-${id}.user.js`, 'attachment');
});

// GET /api/scripts/:id/update - 更新检查端点
// 已迁移到 repo 层
// 使用 /canary/ 路径获取 canary 频道。
// 返回原始脚本代码 — 脚本管理器从元数据解析 @version。
router.get('/:id/update', async (req: Request, res: Response) => {
    const id = parseInt(String(req.params.id));
    if (isNaN(id)) {
        res.status(400).type('text/plain').send('无效的脚本 ID');
        return;
    }

    const channel = getChannel(req, res);
    const row = await scriptRepo.findByIdColumns(id, { id: true, code: true, canaryCode: true, canaryVersion: true, filename: true, version: true });
    if (!row) {
        res.status(404).type('text/plain').send('脚本不存在');
        return;
    }

    const { code, version } = resolveScriptChannel(row, channel);

    // 记录更新检查日志
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const ipHash = hashIP(ip);
    logRepo.createUpdate({ scriptId: id, oldVersion: version, newVersion: version, ipHash }).catch(() => { });
    scriptRepo.incrementUpdateChecks(id).catch(() => { });

    sendScriptCode(res, code, row.filename || `script-${id}.user.js`);
});

// GET /api/scripts/:id/check-update - 前端 UI 的 JSON 更新检查
router.get('/:id/check-update', async (req: Request, res: Response) => {
    const id = parseInt(String(req.params.id));
    if (isNaN(id)) {
        res.status(400).json({ error: '无效的脚本 ID' });
        return;
    }

    const currentVersion = String(req.query.version ?? '0.0.0');

    const script = await scriptRepo.findByIdColumns(id, { id: true, name: true, version: true });
    if (!script) {
        res.status(404).json({ error: '脚本不存在' });
        return;
    }

    // 记录更新检查日志
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const ipHash = hashIP(ip);
    logRepo.createUpdate({ scriptId: id, oldVersion: currentVersion, newVersion: script.version, ipHash }).catch(() => { });
    scriptRepo.incrementUpdateChecks(id).catch(() => { });

    // 审计：检查更新
    audit('script.check_update', null, `检查脚本更新: ${script.name} (v${currentVersion} → v${script.version})`, { scriptId: id, oldVersion: currentVersion, newVersion: script.version });

    const hasUpdate = currentVersion !== script.version;

    const baseUrl = `${req.protocol}://${req.get('host')}`;

    res.json({
        hasUpdate: hasUpdate,
        latestVersion: script.version,
        currentVersion: currentVersion,
        scriptUrl: `${baseUrl}/api/scripts/${id}`,
        updateUrl: `${baseUrl}/api/scripts/${id}/update`,
        downloadUrl: `${baseUrl}/api/scripts/${id}/install`,
        scriptContentUrl: `${baseUrl}/api/scripts/${id}/code`,
    });
});

// POST /api/scripts - 上传新脚本（需已登录）
router.post('/', requireAuth, writeLimiter, async (req: Request, res: Response) => {
    const { code, filename, readme } = req.body;

    if (!code || typeof code !== 'string') {
        res.status(400).json({ error: '脚本代码不能为空' });
        return;
    }

    const validation = await validateScriptMeta(code, filename, readme);
    if (!validation.ok) {
        const { status, body } = validation.error!;
        const user = getCurrentUser(req);
        audit('script.create', user?.userId ?? null, `上传脚本被拒绝: ${body.error}`, {
            reason: body.error,
            details: body.details,
        });
        res.status(status).json(body);
        return;
    }

    const { meta, safeFilename, safeReadme, warnings } = validation;
    const user = getCurrentUser(req);

    const now = new Date();

    const newScript = await scriptRepo.create(buildScriptData(meta, code, safeReadme, {
        filename: safeFilename,
        userId: user?.userId,
        createdAt: now,
    }) as NewScript);

    res.status(201).json({
        message: '脚本上传成功',
        script: newScript,
        warnings: warnings.length > 0 ? warnings : undefined,
    });

    // 审计日志
    const currentUser = getCurrentUser(req);
    audit('script.create', currentUser?.userId ?? null, `上传脚本: ${newScript.name}`, {
        scriptId: newScript.id,
        version: newScript.version,
    });
});

// PUT /api/scripts/:id - 更新现有脚本（需已登录）
router.put('/:id', requireAuth, writeLimiter, async (req: Request, res: Response) => {
    const id = parseInt(String(req.params.id));
    if (isNaN(id)) {
        res.status(400).json({ error: '无效的脚本 ID' });
        return;
    }

    const user = getCurrentUser(req);
    const existing = await scriptRepo.findByIdColumns(id, {
        id: true, version: true, userId: true,
    });
    if (!existing) {
        res.status(404).json({ error: '脚本不存在' });
        return;
    }

    // 所有权检查：仅所有者或管理员可编辑
    if (existing.userId && user?.userId !== existing.userId && user?.role !== 'admin') {
        res.status(403).json({ error: '你没有权限编辑此脚本' });
        return;
    }

    const { code, readme } = req.body;
    if (!code || typeof code !== 'string') {
        res.status(400).json({ error: '脚本代码不能为空' });
        return;
    }

    // 验证代码大小
    if (!isValidCodeSize(code)) {
        res.status(400).json({ error: `脚本代码超过大小限制 (${FIELD_LIMITS.code / 1024 / 1024}MB)` });
        return;
    }

    const validation = await validateScriptMeta(code, req.body.filename, readme, { excludeId: id });
    if (!validation.ok) {
        const { status, body } = validation.error!;
        audit('script.update', user?.userId ?? null, `更新脚本 #${id} 被拒绝: ${body.error}`, {
            scriptId: id,
            reason: body.error,
            details: body.details,
        });
        res.status(status).json(body);
        return;
    }

    const { meta, safeReadme, warnings } = validation;

    const filename = `${meta.name?.replace(/\s+/g, '-')}.user.js` || 'script.user.js';
    await scriptRepo.update(id, buildScriptData(meta, code, safeReadme, { filename }) as Partial<ScriptUpdateData>);

    const updated = await scriptRepo.findByIdColumns(id, {
        id: true, name: true, version: true, updatedAt: true,
    });

    res.json({
        message: '脚本更新成功',
        script: updated,
        warnings: warnings.length > 0 ? warnings : undefined,
    });

    // 审计日志
    audit('script.update', user?.userId ?? null, `更新脚本: ${updated?.name}  (v${existing.version} → v${updated?.version})`, {
        scriptId: id,
        oldVersion: existing.version,
        newVersion: updated?.version,
    });
});

// DELETE /api/scripts/:id - 删除脚本（需已登录）
router.delete('/:id', requireAuth, writeLimiter, async (req: Request, res: Response) => {
    const id = parseInt(String(req.params.id));
    if (isNaN(id)) {
        res.status(400).json({ error: '无效的脚本 ID' });
        return;
    }

    const user = getCurrentUser(req);
    const existing = await scriptRepo.findByIdColumns(id, { id: true, userId: true });
    if (!existing) {
        res.status(404).json({ error: '脚本不存在' });
        return;
    }

    // 所有权检查
    if (existing.userId && user?.userId !== existing.userId && user?.role !== 'admin') {
        res.status(403).json({ error: '你没有权限删除此脚本' });
        return;
    }

    await scriptRepo.delete(id);

    res.json({ message: '脚本已删除（可恢复）' });

    // 审计日志
    audit('script.delete', user?.userId ?? null, `删除脚本 ID=${id}`, {
        scriptId: id,
    });
});

// DELETE /api/scripts/:id/hard - 永久删除（仅管理员）
router.delete('/:id/hard', requireAuth, async (req: Request, res: Response) => {
    const user = getCurrentUser(req);
    if (user?.role !== 'admin') {
        res.status(403).json({ error: '仅管理员可永久删除脚本' });
        return;
    }

    const id = parseInt(String(req.params.id));
    if (isNaN(id)) {
        res.status(400).json({ error: '无效的脚本 ID' });
        return;
    }

    await scriptRepo.hardDelete(id);
    res.json({ message: '脚本已永久删除' });

    audit('script.hard_delete', user.userId, `永久删除脚本 ID=${id}`, { scriptId: id });
});

// ── 每个脚本的 Webhook 管理 ──

// POST /api/scripts/:id/webhook-secret - 生成/重新生成 webhook secret（用于 GitHub HMAC-SHA256）
router.post('/:id/webhook-secret', requireAuth, async (req: Request, res: Response) => {
    const id = parseInt(String(req.params.id));
    if (isNaN(id)) {
        res.status(400).json({ error: '无效的脚本 ID' });
        return;
    }

    const existing = await scriptRepo.findByIdColumns(id, { id: true, userId: true });
    if (!existing) {
        res.status(404).json({ error: '脚本不存在' });
        return;
    }

    const user = getCurrentUser(req);
    if (existing.userId && user?.userId !== existing.userId && user?.role !== 'admin') {
        res.status(403).json({ error: '你没有权限修改此脚本的 Webhook 配置' });
        return;
    }

    // 生成 48 字符的随机十六进制令牌
    const secret = generateSecret(24);
    await scriptRepo.setWebhookSecret(id, secret);

    // 审计：生成 Webhook 密钥
    audit('script.webhook_secret', user?.userId ?? null, `生成脚本 ID=${id} 的 Webhook 密钥`, { scriptId: id });

    const baseUrl = `${req.protocol}://${req.get('host')}`;
    res.json({
        message: 'Webhook 密钥已生成',
        webhookSecret: secret,
        webhookUrl: `${baseUrl}/api/webhook/scripts/${id}`,
    });
});

// GET /api/scripts/:id/webhook-info - 获取 webhook 配置（仅所有者/管理员）
router.get('/:id/webhook-info', requireAuth, async (req: Request, res: Response) => {
    const id = parseInt(String(req.params.id));
    if (isNaN(id)) {
        res.status(400).json({ error: '无效的脚本 ID' });
        return;
    }

    const row = await scriptRepo.findByIdColumns(id, { id: true, name: true, webhookSecret: true, githubRepo: true, githubPath: true, canaryVersion: true, userId: true });

    if (!row) {
        res.status(404).json({ error: '脚本不存在' });
        return;
    }

    const user = getCurrentUser(req);
    if (row.userId && user?.userId !== row.userId && user?.role !== 'admin') {
        res.status(403).json({ error: '你没有权限查看此脚本的 Webhook 配置' });
        return;
    }

    const baseUrl = `${req.protocol}://${req.get('host')}`;
    res.json({
        scriptId: row.id,
        scriptName: row.name,
        webhookSecret: row.webhookSecret || '',
        webhookUrl: `${baseUrl}/api/webhook/scripts/${row.id}`,
        githubRepo: row.githubRepo || '',
        githubPath: row.githubPath || '',
        canaryVersion: row.canaryVersion || '',
    });
});

// PUT /api/scripts/:id/github-config - 设置 GitHub 仓库信息
router.put('/:id/github-config', requireAuth, async (req: Request, res: Response) => {
    const id = parseInt(String(req.params.id));
    if (isNaN(id)) {
        res.status(400).json({ error: '无效的脚本 ID' });
        return;
    }

    const existing = await scriptRepo.findByIdColumns(id, { id: true, userId: true });
    if (!existing) {
        res.status(404).json({ error: '脚本不存在' });
        return;
    }

    const user = getCurrentUser(req);
    if (existing.userId && user?.userId !== existing.userId && user?.role !== 'admin') {
        res.status(403).json({ error: '你没有权限修改此脚本的 GitHub 配置' });
        return;
    }

    const { githubRepo, githubPath } = req.body;

    await scriptRepo.update(id, {
        githubRepo: sanitizeField(githubRepo || '', 200),
        githubPath: sanitizeField(githubPath || '', 500),
    });

    // 审计：更新 GitHub 配置
    audit('script.github_config', user?.userId ?? null, `更新脚本 ID=${id} 的 GitHub 配置`, { scriptId: id, githubRepo, githubPath });

    res.json({ message: 'GitHub 配置已更新' });
});

// ── .user.js 安装路由（必须在所有 /:id/ 特定路由之后） ──

// GET /api/scripts/:id/:filename.user.js - 通过 `.user.js` URL 安装脚本
// 用户脚本管理器检测到 `.user.js` URL 后提示安装。
router.get('/:id/:filename.user.js', async (req: Request, res: Response) => {
    const id = parseScriptId(req, res);
    if (id === null) return;

    const channel = getChannel(req, res);
    const row = await scriptRepo.findByIdColumns(id, { code: true, canaryCode: true, canaryVersion: true, filename: true, version: true });
    if (!row) {
        res.status(404).type('text/plain').send('脚本不存在');
        return;
    }

    const { code } = resolveScriptChannel(row, channel);
    logInstall(id, req, channel);

    const filename = row.filename || `script-${id}.user.js`;
    sendScriptCode(res, code, filename, 'attachment');
});

// ── 评分 ──

// GET /api/scripts/:id/ratings - 获取脚本评分汇总
router.get('/:id/ratings', async (req: Request, res: Response) => {
    const id = parseInt(String(req.params.id));
    if (isNaN(id)) {
        res.status(400).json({ error: '无效的脚本 ID' });
        return;
    }

    const ratingStats = await scriptRepo.getRatingStats(id);

    // 获取已登录用户的评分
    const currentUser = getCurrentUser(req);
    let userRating: number | null = null;
    if (currentUser?.userId) {
        const row = await ratingRepo.findByUserAndScript(currentUser.userId, id);
        if (row) userRating = row.score;
    }

    res.json({
        average: ratingStats.avg ?? 0,
        count: ratingStats.count,
        userRating,
    });
});

// POST /api/scripts/:id/rate - 提交或更新评分（需已登录）
router.post('/:id/rate', requireAuth, writeLimiter, async (req: Request, res: Response) => {
    const id = parseInt(String(req.params.id));
    if (isNaN(id)) {
        res.status(400).json({ error: '无效的脚本 ID' });
        return;
    }

    const { score } = req.body;
    if (!Number.isInteger(score) || score < 1 || score > 5) {
        res.status(400).json({ error: '评分必须在 1-5 之间' });
        return;
    }

    // 验证脚本是否存在
    const script = await scriptRepo.findByIdColumns(id, { id: true });
    if (!script) {
        res.status(404).json({ error: '脚本不存在' });
        return;
    }

    const currentUser = getCurrentUser(req);
    if (!currentUser?.userId) {
        res.status(401).json({ error: '请先登录' });
        return;
    }

    // 使用 repo 的 upsert
    await ratingRepo.upsert(currentUser.userId, id, { score, comment: req.body.comment });

    // 返回更新后的统计
    const stats = await scriptRepo.getRatingStats(id);

    // 审计：评分
    audit('script.rate', currentUser.userId, `对脚本 ID=${id} 评分 ${score} 分`, { scriptId: id, score });

    res.json({
        message: '评分成功',
        average: stats.avg ? Math.round(Number(stats.avg) * 10) / 10 : score,
        count: stats.count,
        userRating: score,
    });
});

export default router;
