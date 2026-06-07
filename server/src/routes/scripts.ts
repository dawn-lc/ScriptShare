import { Router, Request, Response, NextFunction } from 'express';
import { getClientIp, hashIP } from '../utils/ip';
import { db } from '../db';
import { scripts, installLogs, updateLogs, ratings } from '../db';
import { eq, sql, count, like, or, and, avg, asc, desc, inArray } from 'drizzle-orm';
import rateLimit from 'express-rate-limit';
import { Script, ScriptListItem } from '../models/script';
import UAParser from 'ua-parser-js';
import { requireAuth, getCurrentUser } from '../middleware/auth';
import { audit } from '../utils/audit';

import {
    sanitizeField,
    sanitize,
    isValidVersion,
    isValidCodeSize,
    containsMaliciousContent,
    isValidFilename,
    generateSecret,
    FIELD_LIMITS,
} from '../utils/validate';
import { SCRIPTS_WRITE_WINDOW_MS, SCRIPTS_WRITE_MAX, README_MAX_LENGTH } from '../config';

const router = Router();

// 写操作限流
const writeLimiter = rateLimit({
    windowMs: SCRIPTS_WRITE_WINDOW_MS,
    max: SCRIPTS_WRITE_MAX,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: '操作过于频繁，请稍后再试' },
});

type MetadataDict = Record<string, string | (string | null)[] | null>;

/** Parse UserScript metadata block into a dictionary of key-value pairs.
 *  Multi-value keys (e.g. @grant, @match) are stored as arrays. */
function parseMetadata(content: string): MetadataDict {
    const startTag = '// ==UserScript==';
    const endTag = '// ==/UserScript==';

    const startIndex = content.indexOf(startTag);
    if (startIndex === -1) throw new Error('No metadata block found');

    const bodyStart = startIndex + startTag.length;
    const endIndex = content.indexOf(endTag, bodyStart);
    if (endIndex === -1) throw new Error('Unclosed metadata block');

    const block = content.slice(bodyStart, endIndex);

    const lines = block
        .split('\n')
        .map(l => l.trim())
        .filter(l => l.startsWith('// @'))
        .map(l => l.replace('// @', '').trim());

    if (lines.length === 0) throw new Error('No metadata entries found');

    const results: MetadataDict = {};

    for (const line of lines) {
        const spaceIdx = line.indexOf(' ');
        const key = spaceIdx === -1 ? line : line.slice(0, spaceIdx);
        const value = spaceIdx === -1 ? null : line.slice(spaceIdx + 1).trim();

        if (!key) continue;

        const prev = results[key];
        if (prev === undefined) {
            results[key] = value;
        } else {
            const arr = Array.isArray(prev) ? prev : [prev];
            if (value !== null) arr.push(value);
            results[key] = arr;
        }
    }

    return results;
}

/**
 * 将元数据值（字符串、数组或 null）连接为单行换行符分隔的字符串。
 * 用于将解析后的 MetadataDict 转换为数据库列的平面字符串。
 */
function joinMeta(val: string | (string | null)[] | null): string {
    if (val == null) return '';
    if (Array.isArray(val)) return val.filter((x): x is string => x !== null).join('\n');
    return val;
}

/** 将 MetadataDict 转换为 Partial<Script> 用于数据库插入/更新。 */
function metaToScript(meta: MetadataDict): Partial<Script> {
    const script: Partial<Script> = {};
    const toStr = (key: string): string => joinMeta(meta[key] ?? null);

    // 将 @include 合并到 @match
    const collect = (key: string): string[] => {
        const v = meta[key];
        if (v == null) return [];
        return Array.isArray(v) ? v.filter((x): x is string => x !== null) : [v];
    };
    const matchVals = [...collect('match'), ...collect('include')];

    script.name = toStr('name');
    script.namespace = toStr('namespace');
    script.version = toStr('version') || '1.0.0';
    script.description = toStr('description');
    script.author = toStr('author');
    script.icon = toStr('icon');
    script.icon64 = toStr('icon64');
    script.grant = toStr('grant');
    script.match = matchVals.join('\n');
    script.exclude = toStr('exclude');
    script.require = toStr('require');
    script.resource = toStr('resource');
    script.connect = toStr('connect');
    script.supportURL = toStr('supportURL') || toStr('homepageURL');

    // 提取本地化元数据（如 @name:zh-CN、@description:ja）
    const i18n: Record<string, Record<string, string>> = {};
    for (const key of Object.keys(meta)) {
        const match = key.match(/^(name|description):(.+)$/);
        if (match) {
            const [, field, locale] = match;
            const val = toStr(key);
            if (val) {
                if (!i18n[field]) i18n[field] = {};
                i18n[field][locale] = val;
            }
        }
    }
    if (Object.keys(i18n).length > 0) {
        script.i18n = i18n;
    }

    return script;
}

// 向后兼容包装器
function parseUserscriptMeta(code: string): Partial<Script> {
    const meta = parseMetadata(code);
    return metaToScript(meta);
}

// ── 上传后元数据检测 ──

export interface MetadataWarning {
    field: string;
    type: 'missing' | 'security' | 'consistency' | 'best-practice';
    message: string;
}

interface MetadataCheckResult {
    /** 阻断性错误——缺少保存到数据库所必需的元数据，上传/更新将被拒绝 */
    errors: MetadataWarning[];
    /** 非阻断性警告——仅供参考，不影响保存 */
    warnings: MetadataWarning[];
}

/**
 * 对已解析的 UserScript 元数据进行完整性、安全性和最佳实践检测。
 * - errors: 缺少必要字段（@namespace、@match/@include、@version、@grant），上传/更新将被拒绝
 * - warnings: 非必须问题，仅用于提醒脚本作者
 */
function checkMetadata(meta: MetadataDict, code: string): MetadataCheckResult {
    const errors: MetadataWarning[] = [];
    const warnings: MetadataWarning[] = [];
    const addError = (field: string, message: string) =>
        errors.push({ field, type: 'missing', message });
    const addWarning = (field: string, type: MetadataWarning['type'], message: string) =>
        warnings.push({ field, type, message });

    // ════════ 阻断性检测（缺少保存到数据库所必需的元数据）════════

    // @name 已在上层单独校验，此处不再重复

    if (!meta.namespace) {
        addError('namespace', '缺少 @namespace，该字段是脚本的唯一标识符，必须提供');
    }
    if (!meta.match && !meta.include) {
        addError('match', '缺少 @match 或 @include，脚本需要指定运行的网址范围，必须提供');
    }
    if (!meta.grant) {
        addError('grant', '缺少 @grant，脚本必须声明所需的 API 权限，无特殊权限请设为 @grant none');
    }
    if (!meta.version) {
        addError('version', '缺少 @version，脚本需要版本号以支持更新管理');
    }

    // 阻断性检测在此返回，errors 非空时上层将阻止保存
    if (errors.length > 0) return { errors, warnings };

    // ════════ 非阻断性警告 ════════

    if (!meta.author) addWarning('author', 'best-practice', '建议添加 @author 以便用户了解脚本作者');
    if (!meta.description) addWarning('description', 'best-practice', '建议添加 @description 简要描述脚本功能');

    // ── 安全性检测 ──
    const requireVal = meta.require;
    const requireUrls = requireVal
        ? (Array.isArray(requireVal) ? requireVal : [requireVal]).filter((x): x is string => x !== null)
        : [];
    for (const url of requireUrls) {
        if (/^http:\/\//i.test(url)) {
            addWarning('require', 'security', `@require 使用了 HTTP 而不是 HTTPS: ${url}，可能存在中间人攻击风险`);
        }
        if (/^\/\//.test(url)) {
            addWarning('require', 'security', `@require 使用了协议相对 URL: ${url}，建议使用完整 HTTPS 地址`);
        }
    }

    const resourceVal = meta.resource;
    const resourceUrls = resourceVal
        ? (Array.isArray(resourceVal) ? resourceVal : [resourceVal]).filter((x): x is string => x !== null)
        : [];
    for (const entry of resourceUrls) {
        const parts = entry.split(/\s+/);
        const url = parts.length > 1 ? parts[parts.length - 1] : entry;
        if (/^http:\/\//i.test(url)) {
            addWarning('resource', 'security', `@resource 使用了 HTTP: ${url}，建议使用 HTTPS`);
        }
    }

    // 检测 @grant none 但代码中使用了 GM_ API
    const grantVal = meta.grant;
    const grantValues = grantVal
        ? (Array.isArray(grantVal) ? grantVal : [grantVal]).filter((x): x is string => x !== null)
        : [];
    const isGrantNone = grantValues.length === 1 && grantValues[0] === 'none';
    if (isGrantNone) {
        const gmUsage = code.match(/GM_\w+|GM\.\w+/g);
        if (gmUsage && gmUsage.length > 0) {
            const unique = [...new Set(gmUsage)];
            addWarning('grant', 'consistency', `声明了 @grant none 但代码中使用了 GM API: ${unique.slice(0, 5).join(', ')}${unique.length > 5 ? '...' : ''}`);
        }
    }

    // 检测 @grant 包含危险 API 但未配置对应的 @connect
    const dangerousGrants = ['GM_xmlhttpRequest', 'GM.xmlHttpRequest'];
    const hasXhrGrant = grantValues.some(g => dangerousGrants.includes(g));
    if (hasXhrGrant && !meta.connect) {
        addWarning('grant', 'security', '使用了 GM_xmlhttpRequest 权限但缺少 @connect，跨域请求可能受限');
    }

    return { errors, warnings };
}

// GET /api/scripts - 获取脚本列表
router.get('/', (req: Request, res: Response) => {
    const page = parseInt(String(req.query.page ?? '')) || 1;
    const limit = parseInt(String(req.query.limit ?? '')) || 20;
    const offset = (page - 1) * limit;
    const search = String(req.query.search ?? '');
    const sort = String(req.query.sort ?? 'updatedAt');

    const sortMap: Record<string, import('drizzle-orm').AnyColumn> = {
        updatedAt: scripts.updatedAt,
        createdAt: scripts.createdAt,
        installs: scripts.installs,
        name: scripts.name,
        updateChecks: scripts.updateChecks,
    };
    const sortCol = sortMap[sort] || scripts.updatedAt;
    const sortDirFn = req.query.order === 'asc' ? asc : desc;

    // 使用 Drizzle 查询构建器构建查询
    const searchFilter = search
        ? or(
            like(scripts.name, `%${search}%`),
            like(scripts.description, `%${search}%`),
            like(scripts.author, `%${search}%`),
        )
        : undefined;

    const [{ total }] = searchFilter
        ? db.select({ total: count() }).from(scripts).where(searchFilter).all()
        : db.select({ total: count() }).from(scripts).all();

    const fields = {
        id: scripts.id, name: scripts.name, namespace: scripts.namespace,
        version: scripts.version, description: scripts.description, author: scripts.author,
        icon: scripts.icon, icon64: scripts.icon64,
        installs: scripts.installs, updateChecks: scripts.updateChecks,
        createdAt: scripts.createdAt, updatedAt: scripts.updatedAt,
        i18n: scripts.i18n,
        supportURL: scripts.supportURL,
    };

    const baseQuery = searchFilter
        ? db.select(fields).from(scripts).where(searchFilter)
        : db.select(fields).from(scripts);

    // db 为 Proxy 动态类型（支持 SQLite/PG 双方言），查询结果无法静态推导具体结构
    const scriptList = baseQuery
        .orderBy(sortDirFn(sortCol))
        .limit(limit)
        .offset(offset)
        .all() as unknown as (ScriptListItem & { rating?: number; ratingCount?: number })[];
    const totalPages = Math.ceil(total / limit);

    // 将 i18n JSON 字符串解析为对象并附加评分数据
    const scriptIds = scriptList.map(s => s.id);
    const ratingMap = new Map<number, { avg: number; cnt: number }>();
    if (scriptIds.length > 0) {
        interface RatingRow { scriptId: number; average: number; count: number; }
        // db 为 Proxy 动态类型，聚合查询返回类型无法静态推导
        const ratingsData = db.select({
            scriptId: ratings.scriptId,
            average: avg(ratings.score),
            count: count(),
        }).from(ratings)
            .where(inArray(ratings.scriptId, scriptIds))
            .groupBy(ratings.scriptId)
            .all() as RatingRow[];
        for (const r of ratingsData) {
            ratingMap.set(r.scriptId, { avg: Math.round(Number(r.average) * 10) / 10, cnt: r.count });
        }
    }

    for (const s of scriptList) {
        // i18n 已由 jsonField 列类型自动解析为对象
        const item = s as { i18n?: Record<string, Record<string, string>> };
        const r = ratingMap.get(s.id);
        s.rating = r ? r.avg : 0;
        s.ratingCount = r ? r.cnt : 0;
    }

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
router.get('/:id', (req: Request, res: Response) => {
    const id = parseInt(String(req.params.id));
    if (isNaN(id)) {
        res.status(400).json({ error: '无效的脚本 ID' });
        return;
    }

    const script = db.select().from(scripts).where(eq(scripts.id, id)).get();

    if (!script) {
        res.status(404).json({ error: '脚本不存在' });
        return;
    }

    // i18n 已由 jsonField 列类型自动解析为对象

    // 附加评分数据
    const [ratingStats] = db.select({
        average: avg(ratings.score),
        count: count(),
    }).from(ratings).where(eq(ratings.scriptId, id)).all();
    script.rating = ratingStats.average ? Math.round(Number(ratingStats.average) * 10) / 10 : 0;
    script.ratingCount = ratingStats.count;

    res.json({ script });
});

/**
 * 根据频道解析要提供的代码和版本号。
 * 频道来自 URL 路径：/stable/ 或 /canary/
 */
function resolveScriptChannel(row: { code: string; canaryCode?: string | null; version?: string; canaryVersion?: string | null }, channel: string): { code: string; version: string } {
    if (channel === 'canary' && row.canaryCode) {
        return { code: row.canaryCode, version: row.canaryVersion || row.version || '0.0.0' };
    }
    return { code: row.code, version: row.version || '0.0.0' };
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
router.get('/:id/code', (req: Request, res: Response) => {
    const id = parseInt(String(req.params.id));
    if (isNaN(id)) {
        res.status(400).json({ error: '无效的脚本 ID' });
        return;
    }

    const channel = getChannel(req, res);
    // db 为 Proxy 动态类型，select 返回类型无法静态推导
    const row = db.select({
        code: scripts.code, canaryCode: scripts.canaryCode, filename: scripts.filename,
    }).from(scripts).where(eq(scripts.id, id)).get() as { code: string; canaryCode: string | null; filename: string } | undefined;
    if (!row) {
        res.status(404).json({ error: '脚本不存在' });
        return;
    }

    const { code } = resolveScriptChannel(row, channel);
    res.setHeader('Content-Type', 'text/javascript; charset=utf-8');
    res.setHeader('Content-Disposition', `inline; filename="${row.filename || `script-${id}.user.js`}"`);
    res.send(code);
});

// GET /api/scripts/:id/install - 安装脚本
router.get('/:id/install', (req: Request, res: Response) => {
    const id = parseInt(String(req.params.id));
    if (isNaN(id)) {
        res.status(400).json({ error: '无效的脚本 ID' });
        return;
    }

    const channel = getChannel(req, res);
    const row = db.select({
        id: scripts.id, code: scripts.code, canaryCode: scripts.canaryCode,
        canaryVersion: scripts.canaryVersion, filename: scripts.filename, version: scripts.version,
    }).from(scripts).where(eq(scripts.id, id)).get();
    if (!row) {
        res.status(404).json({ error: '脚本不存在' });
        return;
    }

    // 记录安装日志
    const ip = getClientIp(req);
    const ua = req.headers['user-agent'] || '';
    const parser = new UAParser(ua);
    const browserInfo = parser.getBrowser();
    const osInfo = parser.getOS();
    const deviceInfo = parser.getDevice();

    const ipHash = hashIP(ip);

    db.insert(installLogs).values({
        scriptId: id,
        ipHash,
        userAgent: ua,
        browser: `${browserInfo.name || ''} ${browserInfo.version || ''}`.trim(),
        os: `${osInfo.name || ''} ${osInfo.version || ''}`.trim(),
        device: deviceInfo.type || 'desktop',
    }).run();

    // 更新安装计数
    db.update(scripts).set({ installs: sql`${scripts.installs} + 1` }).where(eq(scripts.id, id)).run();

    // 审计：安装
    audit('script.install', null, `安装脚本: ${row.filename || `script-${id}`} (ID=${id})`, { scriptId: id, channel });

    // 返回对应频道的代码
    const { code } = resolveScriptChannel(row, channel);
    res.setHeader('Content-Type', 'text/javascript; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${row.filename || `script-${id}.user.js`}"`);
    res.send(code);
});

// GET /api/scripts/:id/update - 更新检查端点
// 使用 /canary/ 路径获取 canary 频道。
// 返回原始脚本代码 — 脚本管理器从元数据解析 @version。
router.get('/:id/update', (req: Request, res: Response) => {
    const id = parseInt(String(req.params.id));
    if (isNaN(id)) {
        res.status(400).type('text/plain').send('无效的脚本 ID');
        return;
    }

    const channel = getChannel(req, res);
    const row = db.select({
        id: scripts.id, code: scripts.code, canaryCode: scripts.canaryCode,
        canaryVersion: scripts.canaryVersion, filename: scripts.filename, version: scripts.version,
    }).from(scripts).where(eq(scripts.id, id)).get();
    if (!row) {
        res.status(404).type('text/plain').send('脚本不存在');
        return;
    }

    const { code, version } = resolveScriptChannel(row, channel);

    // 记录更新检查日志
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const ipHash = hashIP(ip);
    db.insert(updateLogs).values({
        scriptId: id,
        oldVersion: version,
        newVersion: version,
        ipHash,
    }).run();

    // 更新检查计数
    db.update(scripts).set({ updateChecks: sql`${scripts.updateChecks} + 1` }).where(eq(scripts.id, id)).run();

    // 返回原始脚本代码
    res.setHeader('Content-Type', 'text/javascript; charset=utf-8');
    res.setHeader('Content-Disposition', `inline; filename="${row.filename || `script-${id}.user.js`}"`);
    res.send(code);
});

// GET /api/scripts/:id/check-update - 前端 UI 的 JSON 更新检查
router.get('/:id/check-update', (req: Request, res: Response) => {
    const id = parseInt(String(req.params.id));
    if (isNaN(id)) {
        res.status(400).json({ error: '无效的脚本 ID' });
        return;
    }

    const currentVersion = String(req.query.version ?? '0.0.0');

    const script = db.select({
        id: scripts.id, name: scripts.name, version: scripts.version,
        // db 为 Proxy 动态类型，get() 返回类型无法静态推导
    }).from(scripts).where(eq(scripts.id, id)).get() as Script | undefined;
    if (!script) {
        res.status(404).json({ error: '脚本不存在' });
        return;
    }

    // 记录更新检查日志
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const ipHash = hashIP(ip);
    db.insert(updateLogs).values({
        scriptId: id,
        oldVersion: currentVersion,
        newVersion: script.version,
        ipHash,
    }).run();

    // 更新检查计数
    db.update(scripts).set({ updateChecks: sql`${scripts.updateChecks} + 1` }).where(eq(scripts.id, id)).run();

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

    // 验证代码大小
    if (!isValidCodeSize(code)) {
        res.status(400).json({ error: `脚本代码超过大小限制 (${FIELD_LIMITS.code / 1024 / 1024}MB)` });
        return;
    }

    // 从代码中解析元数据（用于数据库存储）
    const meta = parseUserscriptMeta(code);

    if (!meta.name) {
        res.status(400).json({ error: '脚本缺少 @name 元数据' });
        return;
    }

    // 校验并清理元数据
    meta.name = sanitizeField(meta.name, FIELD_LIMITS.name);
    if (containsMaliciousContent(meta.name)) {
        res.status(400).json({ error: '脚本名称包含不安全内容' });
        return;
    }

    // 检查重名
    const existing = db.select({ id: scripts.id }).from(scripts).where(eq(scripts.name, meta.name!)).get();
    if (existing) {
        res.status(409).json({ error: `名为 "${meta.name}" 的脚本已存在` });
        return;
    }

    // 验证版本号（如有）
    if (meta.version && !isValidVersion(meta.version)) {
        res.status(400).json({ error: '无效的版本号格式' });
        return;
    }

    // 验证文件名（如有）
    if (filename && !isValidFilename(filename)) {
        res.status(400).json({ error: '无效的文件名' });
        return;
    }

    // 清理所有元数据字段
    const safeFilename = filename && isValidFilename(filename)
        ? filename
        : `${meta.name.replace(/\s+/g, '-')}.user.js`;

    const user = getCurrentUser(req);

    const safeReadme = readme ? sanitizeField(readme, README_MAX_LENGTH) : '';

    // 先在内存中检测元数据完整性，通过后再写入数据库
    const rawMeta = parseMetadata(code);
    const { errors: metaErrors, warnings } = checkMetadata(rawMeta, code);
    if (metaErrors.length > 0) {
        res.status(400).json({
            error: '脚本元数据不完整',
            details: metaErrors.map(e => `${e.field}: ${e.message}`),
        });
        return;
    }

    const now = new Date();

    const [newScript] = await (db.insert(scripts).values({
        name: sanitizeField(meta.name, FIELD_LIMITS.name),
        namespace: sanitizeField(meta.namespace || '', FIELD_LIMITS.namespace),
        version: sanitizeField(meta.version || '1.0.0', FIELD_LIMITS.version),
        description: sanitizeField(meta.description || '', FIELD_LIMITS.description),
        author: sanitizeField(meta.author || '', FIELD_LIMITS.author),
        icon: sanitizeField(meta.icon || '', FIELD_LIMITS.metadata_line),
        icon64: sanitizeField(meta.icon64 || '', FIELD_LIMITS.metadata_line),
        grant: sanitizeField(meta.grant || '', FIELD_LIMITS.metadata_line),
        match: sanitizeField(meta.match || '', FIELD_LIMITS.metadata_line),
        exclude: sanitizeField(meta.exclude || '', FIELD_LIMITS.metadata_line),
        require: sanitizeField(meta.require || '', FIELD_LIMITS.metadata_line),
        resource: sanitizeField(meta.resource || '', FIELD_LIMITS.metadata_line),
        connect: sanitizeField(meta.connect || '', FIELD_LIMITS.metadata_line),
        code: sanitize(code),
        filename: safeFilename,
        userId: user?.userId || null,
        readme: safeReadme,
        supportURL: sanitizeField(meta.supportURL || '', FIELD_LIMITS.metadata_line),
        i18n: meta.i18n || {},
        createdAt: now,
        updatedAt: now,
    }).returning({
        id: scripts.id, name: scripts.name, version: scripts.version, createdAt: scripts.createdAt,
    }));

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
router.put('/:id', requireAuth, writeLimiter, (req: Request, res: Response) => {
    const id = parseInt(String(req.params.id));
    if (isNaN(id)) {
        res.status(400).json({ error: '无效的脚本 ID' });
        return;
    }

    const user = getCurrentUser(req);
    const existing = db.select({
        id: scripts.id, version: scripts.version, userId: scripts.userId,
    }).from(scripts).where(eq(scripts.id, id)).get();
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

    const meta = parseUserscriptMeta(code);

    // 验证并清理
    if (meta.version && !isValidVersion(meta.version)) {
        res.status(400).json({ error: '无效的版本号格式' });
        return;
    }

    const safeReadme = readme ? sanitizeField(readme, README_MAX_LENGTH) : '';

    // 先在内存中检测元数据完整性，通过后再写入数据库
    const rawMeta = parseMetadata(code);
    const { errors: metaErrors, warnings } = checkMetadata(rawMeta, code);
    if (metaErrors.length > 0) {
        res.status(400).json({
            error: '脚本元数据不完整',
            details: metaErrors.map(e => `${e.field}: ${e.message}`),
        });
        return;
    }

    db.update(scripts).set({
        name: sanitizeField(meta.name || 'Untitled', FIELD_LIMITS.name),
        namespace: sanitizeField(meta.namespace || '', FIELD_LIMITS.namespace),
        version: sanitizeField(meta.version || '1.0.0', FIELD_LIMITS.version),
        description: sanitizeField(meta.description || '', FIELD_LIMITS.description),
        author: sanitizeField(meta.author || '', FIELD_LIMITS.author),
        icon: sanitizeField(meta.icon || '', FIELD_LIMITS.metadata_line),
        icon64: sanitizeField(meta.icon64 || '', FIELD_LIMITS.metadata_line),
        grant: sanitizeField(meta.grant || '', FIELD_LIMITS.metadata_line),
        match: sanitizeField(meta.match || '', FIELD_LIMITS.metadata_line),
        exclude: sanitizeField(meta.exclude || '', FIELD_LIMITS.metadata_line),
        require: sanitizeField(meta.require || '', FIELD_LIMITS.metadata_line),
        resource: sanitizeField(meta.resource || '', FIELD_LIMITS.metadata_line),
        connect: sanitizeField(meta.connect || '', FIELD_LIMITS.metadata_line),
        code: sanitize(code),
        filename: `${meta.name?.replace(/\s+/g, '-')}.user.js` || 'script.user.js',
        readme: safeReadme,
        supportURL: sanitizeField(meta.supportURL || '', FIELD_LIMITS.metadata_line),
        i18n: meta.i18n || {},
        updatedAt: new Date(),
    }).where(eq(scripts.id, id)).run();

    const updated = db.select({
        id: scripts.id, name: scripts.name, version: scripts.version, updatedAt: scripts.updatedAt,
    }).from(scripts).where(eq(scripts.id, id)).get();

    res.json({
        message: '脚本更新成功',
        script: updated,
        warnings: warnings.length > 0 ? warnings : undefined,
    });

    // 审计日志
    audit('script.update', user?.userId ?? null, `更新脚本: ${updated.name}  (v${existing.version} → v${updated.version})`, {
        scriptId: id,
        oldVersion: existing.version,
        newVersion: updated.version,
    });
});

// DELETE /api/scripts/:id - 删除脚本（需已登录）
router.delete('/:id', requireAuth, writeLimiter, (req: Request, res: Response) => {
    const id = parseInt(String(req.params.id));
    if (isNaN(id)) {
        res.status(400).json({ error: '无效的脚本 ID' });
        return;
    }

    const user = getCurrentUser(req);
    const existing = db.select({
        id: scripts.id, userId: scripts.userId,
    }).from(scripts).where(eq(scripts.id, id)).get();
    if (!existing) {
        res.status(404).json({ error: '脚本不存在' });
        return;
    }

    // 所有权检查
    if (existing.userId && user?.userId !== existing.userId && user?.role !== 'admin') {
        res.status(403).json({ error: '你没有权限删除此脚本' });
        return;
    }

    db.delete(scripts).where(eq(scripts.id, id)).run();

    res.json({ message: '脚本已删除' });

    // 审计日志
    audit('script.delete', user?.userId ?? null, `删除脚本 ID=${id}`, {
        scriptId: id,
    });
});

// ── 每个脚本的 Webhook 管理 ──

// POST /api/scripts/:id/webhook-secret - 生成/重新生成 webhook secret（用于 GitHub HMAC-SHA256）
router.post('/:id/webhook-secret', requireAuth, (req: Request, res: Response) => {
    const id = parseInt(String(req.params.id));
    if (isNaN(id)) {
        res.status(400).json({ error: '无效的脚本 ID' });
        return;
    }

    const existing = db.select({ id: scripts.id, userId: scripts.userId }).from(scripts).where(eq(scripts.id, id)).get();
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
    db.update(scripts).set({ webhookSecret: secret }).where(eq(scripts.id, id)).run();

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
router.get('/:id/webhook-info', requireAuth, (req: Request, res: Response) => {
    const id = parseInt(String(req.params.id));
    if (isNaN(id)) {
        res.status(400).json({ error: '无效的脚本 ID' });
        return;
    }

    const row = db.select({
        id: scripts.id, name: scripts.name, webhookSecret: scripts.webhookSecret,
        githubRepo: scripts.githubRepo, githubPath: scripts.githubPath, canaryVersion: scripts.canaryVersion,
        userId: scripts.userId,
    }).from(scripts).where(eq(scripts.id, id)).get();

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
router.put('/:id/github-config', requireAuth, (req: Request, res: Response) => {
    const id = parseInt(String(req.params.id));
    if (isNaN(id)) {
        res.status(400).json({ error: '无效的脚本 ID' });
        return;
    }

    const existing = db.select({ id: scripts.id, userId: scripts.userId }).from(scripts).where(eq(scripts.id, id)).get();
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

    db.update(scripts).set({
        githubRepo: sanitizeField(githubRepo || '', 200),
        githubPath: sanitizeField(githubPath || '', 500),
    }).where(eq(scripts.id, id)).run();

    // 审计：更新 GitHub 配置
    audit('script.github_config', user?.userId ?? null, `更新脚本 ID=${id} 的 GitHub 配置`, { scriptId: id, githubRepo, githubPath });

    res.json({ message: 'GitHub 配置已更新' });
});

// ── .user.js 安装路由（必须在所有 /:id/ 特定路由之后） ──

// GET /api/scripts/:id/:filename.user.js - 通过 `.user.js` URL 安装脚本
// 用户脚本管理器检测到 `.user.js` URL 后提示安装。
router.get('/:id/:filename.user.js', (req: Request, res: Response) => {
    const id = parseInt(String(req.params.id));
    if (isNaN(id)) {
        res.status(400).type('text/plain').send('无效的脚本 ID');
        return;
    }

    const channel = getChannel(req, res);
    const row = db.select({
        code: scripts.code, canaryCode: scripts.canaryCode,
        canaryVersion: scripts.canaryVersion, filename: scripts.filename,
        version: scripts.version,
    }).from(scripts).where(eq(scripts.id, id)).get();
    if (!row) {
        res.status(404).type('text/plain').send('脚本不存在');
        return;
    }

    const { code, version } = resolveScriptChannel(row, channel);

    // 记录安装日志
    const ip = getClientIp(req);
    const ua = req.headers['user-agent'] || '';
    const parser = new UAParser(ua);
    const browserInfo = parser.getBrowser();
    const osInfo = parser.getOS();
    const deviceInfo = parser.getDevice();
    const ipHash = hashIP(ip);

    db.insert(installLogs).values({
        scriptId: id,
        ipHash,
        userAgent: ua,
        browser: `${browserInfo.name || ''} ${browserInfo.version || ''}`.trim(),
        os: `${osInfo.name || ''} ${osInfo.version || ''}`.trim(),
        device: deviceInfo.type || 'desktop',
    }).run();

    // 更新安装计数
    db.update(scripts).set({ installs: sql`${scripts.installs} + 1` }).where(eq(scripts.id, id)).run();

    // 审计：安装
    audit('script.install', null, `安装脚本 (${row.filename || `script-${id}`}) 通过 .user.js 路由`, { scriptId: id, channel });

    // 使用匹配 `.user.js` 模式的文件名提供下载
    const filename = row.filename || `script-${id}.user.js`;
    res.setHeader('Content-Type', 'text/javascript; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(code);
});

// ── 评分 ──

// GET /api/scripts/:id/ratings - 获取脚本评分汇总
router.get('/:id/ratings', (req: Request, res: Response) => {
    const id = parseInt(String(req.params.id));
    if (isNaN(id)) {
        res.status(400).json({ error: '无效的脚本 ID' });
        return;
    }

    const [stats] = db.select({
        average: avg(ratings.score),
        count: count(),
    }).from(ratings).where(eq(ratings.scriptId, id)).all();

    // 获取已登录用户的评分
    const currentUser = getCurrentUser(req);
    let userRating: number | null = null;
    if (currentUser?.userId) {
        const row = db.select({ score: ratings.score }).from(ratings)
            .where(and(eq(ratings.scriptId, id), eq(ratings.userId, currentUser.userId)))
            .get();
        if (row) userRating = row.score;
    }

    res.json({
        average: stats.average ? Math.round(Number(stats.average) * 10) / 10 : 0,
        count: stats.count,
        userRating,
    });
});

// POST /api/scripts/:id/rate - 提交或更新评分（需已登录）
router.post('/:id/rate', requireAuth, writeLimiter, (req: Request, res: Response) => {
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
    const script = db.select({ id: scripts.id }).from(scripts).where(eq(scripts.id, id)).get();
    if (!script) {
        res.status(404).json({ error: '脚本不存在' });
        return;
    }

    const currentUser = getCurrentUser(req);
    if (!currentUser?.userId) {
        res.status(401).json({ error: '请先登录' });
        return;
    }

    // 检查用户是否已评分（upsert）
    const existing = db.select({ id: ratings.id }).from(ratings)
        .where(and(eq(ratings.scriptId, id), eq(ratings.userId, currentUser.userId)))
        .get();

    if (existing) {
        db.update(ratings).set({
            score,
            updatedAt: new Date(),
        }).where(eq(ratings.id, existing.id)).run();
    } else {
        db.insert(ratings).values({
            scriptId: id,
            userId: currentUser.userId,
            score,
        }).run();
    }

    // 返回更新后的统计
    const [stats] = db.select({
        average: avg(ratings.score),
        count: count(),
    }).from(ratings).where(eq(ratings.scriptId, id)).all();

    // 审计：评分
    audit('script.rate', currentUser.userId, `对脚本 ID=${id} 评分 ${score} 分`, { scriptId: id, score, isUpdate: !!existing });

    res.json({
        message: '评分成功',
        average: stats.average ? Math.round(Number(stats.average) * 10) / 10 : score,
        count: stats.count,
        userRating: score,
    });
});

export default router;
