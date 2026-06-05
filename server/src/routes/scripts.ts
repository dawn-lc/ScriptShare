import { Router, Request, Response } from 'express';
import { getClientIp, hashIP } from '../utils/ip';
import { db } from '../db';
import { scripts, installLogs, updateLogs, ratings } from '../db';
import { eq, sql, count, like, or, and, avg } from 'drizzle-orm';
import crypto from 'crypto';
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
    FIELD_LIMITS,
} from '../utils/validate';

const router = Router();

// Rate limit write operations
const writeLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 30,
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
 * Join a metadata value (string, array, or null) into a single newline-separated string.
 * Used to convert the parsed MetadataDict into flat strings for DB columns.
 */
function joinMeta(val: string | (string | null)[] | null): string {
    if (val == null) return '';
    if (Array.isArray(val)) return val.filter((x): x is string => x !== null).join('\n');
    return val;
}

/** Convert a MetadataDict to a Partial<Script> for DB insertion/update. */
function metaToScript(meta: MetadataDict): Partial<Script> {
    const script: Partial<Script> = {};
    const toStr = (key: string): string => joinMeta(meta[key] ?? null);

    // Merge @include into @match
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

    // Extract localized metadata (e.g. @name:zh-CN, @description:ja)
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
        script.i18n = JSON.stringify(i18n);
    }

    return script;
}

// Backward-compatible wrapper
function parseUserscriptMeta(code: string): Partial<Script> {
    const meta = parseMetadata(code);
    return metaToScript(meta);
}

// GET /api/scripts - List all scripts
router.get('/', (req: Request, res: Response) => {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const offset = (page - 1) * limit;
    const search = (req.query.search as string) || '';
    const sort = (req.query.sort as string) || 'updatedAt';

    const sortMap: Record<string, string> = {
        updatedAt: '"updatedAt"',
        createdAt: '"createdAt"',
        installs: '"installs"',
        name: '"name"',
        updateChecks: '"updateChecks"',
    };
    const sortCol = sortMap[sort] || '"updatedAt"';
    const sortDir = req.query.order === 'asc' ? 'ASC' : 'DESC';

    // Build query with Drizzle's query builder
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

    const scriptList = baseQuery
        .orderBy(sql.raw(`${sortCol} ${sortDir}`))
        .limit(limit)
        .offset(offset)
        .all() as unknown as (ScriptListItem & { rating?: number; ratingCount?: number })[];
    const totalPages = Math.ceil(total / limit);

    // Parse i18n JSON strings to objects and attach rating data
    const scriptIds = scriptList.map(s => s.id);
    const ratingMap = new Map<number, { avg: number; cnt: number }>();
    if (scriptIds.length > 0) {
        const ratingsData = db.select({
            scriptId: ratings.scriptId,
            average: avg(ratings.score),
            count: count(),
        }).from(ratings)
            .where(sql`${ratings.scriptId} IN (${scriptIds.join(',')})`)
            .groupBy(ratings.scriptId)
            .all() as any[];
        for (const r of ratingsData) {
            ratingMap.set(r.scriptId, { avg: Math.round(Number(r.average) * 10) / 10, cnt: r.count });
        }
    }

    for (const s of scriptList as any[]) {
        if (s.i18n && typeof s.i18n === 'string') {
            try {
                s.i18n = JSON.parse(s.i18n);
            } catch {
                s.i18n = {};
            }
        }
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

// GET /api/scripts/:id - Get script details
router.get('/:id', (req: Request, res: Response) => {
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) {
        res.status(400).json({ error: '无效的脚本 ID' });
        return;
    }

    const script = db.select().from(scripts).where(eq(scripts.id, id)).get() as any;

    if (!script) {
        res.status(404).json({ error: '脚本不存在' });
        return;
    }

    // Parse i18n JSON string to object
    if (script.i18n && typeof script.i18n === 'string') {
        try {
            script.i18n = JSON.parse(script.i18n);
        } catch {
            script.i18n = {};
        }
    }

    // Attach rating data
    const [ratingStats] = db.select({
        average: avg(ratings.score),
        count: count(),
    }).from(ratings).where(eq(ratings.scriptId, id)).all();
    script.rating = ratingStats.average ? Math.round(Number(ratingStats.average) * 10) / 10 : 0;
    script.ratingCount = ratingStats.count;

    res.json({ script });
});

/**
 * Resolve which code+version to serve based on channel.
 * Channel comes from the URL path: /stable/ or /canary/
 */
function resolveScriptChannel(row: any, channel: string): { code: string; version: string } {
    if (channel === 'canary' && row.canaryCode) {
        return { code: row.canaryCode, version: row.canaryVersion || row.version };
    }
    return { code: row.code, version: row.version };
}

/** Extract channel from route param or locals (defaults to stable) */
function getChannel(req: Request, res?: Response): string {
    const fromParams = req.params.channel;
    const channel = Array.isArray(fromParams) ? fromParams[0] : fromParams;
    return channel || String(res?.locals?.channel ?? '') || 'stable';
}

// ── Channel-specific route helpers ──
// Strip the :channel segment from the URL so Express re-matches to the generic handler.
// Saves the channel to res.locals before Express re-matches and overwrites req.params.
function channelRoute() {
    return (req: Request, res: Response, next: any) => {
        const channel = req.params.channel;
        if (channel) {
            res.locals.channel = channel;
            req.url = req.url.replace(`/${channel}`, '');
        }
        next();
    };
}

// Channel routes (must be before generic /:id/ routes)
router.get('/:id/:channel(stable|canary)/code', channelRoute());
router.get('/:id/:channel(stable|canary)/install', channelRoute());
router.get('/:id/:channel(stable|canary)/update', channelRoute());
router.get('/:id/:channel(stable|canary)/check-update', channelRoute());
router.get('/:id/:channel(stable|canary)/script.user.js', channelRoute());

// GET /api/scripts/:id/code
router.get('/:id/code', (req: Request, res: Response) => {
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) {
        res.status(400).json({ error: '无效的脚本 ID' });
        return;
    }

    const channel = getChannel(req, res);
    const row = db.select({
        code: scripts.code, canaryCode: scripts.canaryCode, filename: scripts.filename,
    }).from(scripts).where(eq(scripts.id, id)).get() as any;
    if (!row) {
        res.status(404).json({ error: '脚本不存在' });
        return;
    }

    const { code } = resolveScriptChannel(row, channel);
    res.setHeader('Content-Type', 'text/javascript; charset=utf-8');
    res.setHeader('Content-Disposition', `inline; filename="${row.filename || `script-${id}.user.js`}"`);
    res.send(code);
});

// GET /api/scripts/:id/install
router.get('/:id/install', (req: Request, res: Response) => {
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) {
        res.status(400).json({ error: '无效的脚本 ID' });
        return;
    }

    const channel = getChannel(req, res);
    const row = db.select({
        id: scripts.id, code: scripts.code, canaryCode: scripts.canaryCode,
        canaryVersion: scripts.canaryVersion, filename: scripts.filename, version: scripts.version,
    }).from(scripts).where(eq(scripts.id, id)).get() as any;
    if (!row) {
        res.status(404).json({ error: '脚本不存在' });
        return;
    }

    // Log installation
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

    // Update install count
    db.update(scripts).set({ installs: sql`"installs" + 1` }).where(eq(scripts.id, id)).run();

    // Serve the channel-specific code
    const { code } = resolveScriptChannel(row, channel);
    res.setHeader('Content-Type', 'text/javascript; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${row.filename || `script-${id}.user.js`}"`);
    res.send(code);
});

// GET /api/scripts/:id/update - Update check endpoint
// Use /canary/ path for canary channel.
// Returns raw script code — userscript manager parses @version from metadata.
router.get('/:id/update', (req: Request, res: Response) => {
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) {
        res.status(400).type('text/plain').send('无效的脚本 ID');
        return;
    }

    const channel = getChannel(req, res);
    const row = db.select({
        id: scripts.id, code: scripts.code, canaryCode: scripts.canaryCode,
        canaryVersion: scripts.canaryVersion, filename: scripts.filename, version: scripts.version,
    }).from(scripts).where(eq(scripts.id, id)).get() as any;
    if (!row) {
        res.status(404).type('text/plain').send('脚本不存在');
        return;
    }

    const { code, version } = resolveScriptChannel(row, channel);

    // Log update check
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const ipHash = hashIP(ip);
    db.insert(updateLogs).values({
        scriptId: id,
        oldVersion: version,
        newVersion: version,
        ipHash,
    }).run();

    // Update check count
    db.update(scripts).set({ updateChecks: sql`"updateChecks" + 1` }).where(eq(scripts.id, id)).run();

    // Return raw script code
    res.setHeader('Content-Type', 'text/javascript; charset=utf-8');
    res.setHeader('Content-Disposition', `inline; filename="${row.filename || `script-${id}.user.js`}"`);
    res.send(code);
});

// GET /api/scripts/:id/check-update - JSON update check for frontend UI
router.get('/:id/check-update', (req: Request, res: Response) => {
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) {
        res.status(400).json({ error: '无效的脚本 ID' });
        return;
    }

    const currentVersion = (req.query.version as string) || '0.0.0';

    const script = db.select({
        id: scripts.id, name: scripts.name, version: scripts.version,
    }).from(scripts).where(eq(scripts.id, id)).get() as Script | undefined;
    if (!script) {
        res.status(404).json({ error: '脚本不存在' });
        return;
    }

    // Log update check
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const ipHash = hashIP(ip);
    db.insert(updateLogs).values({
        scriptId: id,
        oldVersion: currentVersion,
        newVersion: script.version,
        ipHash,
    }).run();

    // Update check count
    db.update(scripts).set({ updateChecks: sql`"updateChecks" + 1` }).where(eq(scripts.id, id)).run();

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

// POST /api/scripts - Upload a new script (requires auth)
router.post('/', requireAuth, writeLimiter, async (req: Request, res: Response) => {
    const { code, filename, readme } = req.body;

    if (!code || typeof code !== 'string') {
        res.status(400).json({ error: '脚本代码不能为空' });
        return;
    }

    // Validate code size
    if (!isValidCodeSize(code)) {
        res.status(400).json({ error: `脚本代码超过大小限制 (${FIELD_LIMITS.code / 1024 / 1024}MB)` });
        return;
    }

    // Parse metadata from the code
    const meta = parseUserscriptMeta(code);

    if (!meta.name) {
        res.status(400).json({ error: '脚本缺少 @name 元数据' });
        return;
    }

    // Validate and sanitize metadata
    meta.name = sanitizeField(meta.name, FIELD_LIMITS.name);
    if (containsMaliciousContent(meta.name)) {
        res.status(400).json({ error: '脚本名称包含不安全内容' });
        return;
    }

    // Check for duplicate name
    const existing = db.select({ id: scripts.id }).from(scripts).where(eq(scripts.name, meta.name!)).get();
    if (existing) {
        res.status(409).json({ error: `名为 "${meta.name}" 的脚本已存在` });
        return;
    }

    // Validate version if provided
    if (meta.version && !isValidVersion(meta.version)) {
        res.status(400).json({ error: '无效的版本号格式' });
        return;
    }

    // Validate filename if provided
    if (filename && !isValidFilename(filename)) {
        res.status(400).json({ error: '无效的文件名' });
        return;
    }

    // Sanitize all metadata fields
    const safeFilename = filename && isValidFilename(filename)
        ? filename
        : `${meta.name.replace(/\s+/g, '-')}.user.js`;

    const user = getCurrentUser(req);

    const safeReadme = readme ? sanitizeField(readme, 50000) : '';

    const now = new Date().toISOString();

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
        i18n: meta.i18n || '{}',
        createdAt: now,
        updatedAt: now,
    }).returning({
        id: scripts.id, name: scripts.name, version: scripts.version, createdAt: scripts.createdAt,
    }) as any);

    res.status(201).json({
        message: '脚本上传成功',
        script: newScript,
    });

    // Audit
    const currentUser = getCurrentUser(req);
    audit('script.create', currentUser?.userId ?? null, `上传脚本: ${newScript.name}`, {
        scriptId: newScript.id,
        version: newScript.version,
    });
});

// PUT /api/scripts/:id - Update an existing script (requires auth)
router.put('/:id', requireAuth, writeLimiter, (req: Request, res: Response) => {
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) {
        res.status(400).json({ error: '无效的脚本 ID' });
        return;
    }

    const user = getCurrentUser(req);
    const existing = db.select({
        id: scripts.id, version: scripts.version, userId: scripts.userId,
    }).from(scripts).where(eq(scripts.id, id)).get() as any;
    if (!existing) {
        res.status(404).json({ error: '脚本不存在' });
        return;
    }

    // Ownership check: only owner or admin can edit
    if (existing.userId && user?.userId !== existing.userId && user?.role !== 'admin') {
        res.status(403).json({ error: '你没有权限编辑此脚本' });
        return;
    }

    const { code, readme } = req.body;
    if (!code || typeof code !== 'string') {
        res.status(400).json({ error: '脚本代码不能为空' });
        return;
    }

    // Validate code size
    if (!isValidCodeSize(code)) {
        res.status(400).json({ error: `脚本代码超过大小限制 (${FIELD_LIMITS.code / 1024 / 1024}MB)` });
        return;
    }

    const meta = parseUserscriptMeta(code);

    // Validate and sanitize
    if (meta.version && !isValidVersion(meta.version)) {
        res.status(400).json({ error: '无效的版本号格式' });
        return;
    }

    const safeReadme = readme ? sanitizeField(readme, 50000) : '';

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
        i18n: meta.i18n || '{}',
        updatedAt: new Date().toISOString(),
    }).where(eq(scripts.id, id)).run();

    const updated = db.select({
        id: scripts.id, name: scripts.name, version: scripts.version, updatedAt: scripts.updatedAt,
    }).from(scripts).where(eq(scripts.id, id)).get() as any;

    res.json({
        message: '脚本更新成功',
        script: updated,
    });

    // Audit
    audit('script.update', user?.userId ?? null, `更新脚本: ${updated.name}  (v${existing.version} → v${updated.version})`, {
        scriptId: id,
        oldVersion: existing.version,
        newVersion: updated.version,
    });
});

// DELETE /api/scripts/:id - Delete a script (requires auth)
router.delete('/:id', requireAuth, writeLimiter, (req: Request, res: Response) => {
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) {
        res.status(400).json({ error: '无效的脚本 ID' });
        return;
    }

    const user = getCurrentUser(req);
    const existing = db.select({
        id: scripts.id, userId: scripts.userId,
    }).from(scripts).where(eq(scripts.id, id)).get() as any;
    if (!existing) {
        res.status(404).json({ error: '脚本不存在' });
        return;
    }

    // Ownership check
    if (existing.userId && user?.userId !== existing.userId && user?.role !== 'admin') {
        res.status(403).json({ error: '你没有权限删除此脚本' });
        return;
    }

    db.delete(scripts).where(eq(scripts.id, id)).run();

    res.json({ message: '脚本已删除' });

    // Audit
    audit('script.delete', user?.userId ?? null, `删除脚本 ID=${id}`, {
        scriptId: id,
    });
});

// ── Per-script webhook management ──

// POST /api/scripts/:id/webhook-secret - Generate/regenerate webhook secret (for GitHub HMAC-SHA256)
router.post('/:id/webhook-secret', requireAuth, (req: Request, res: Response) => {
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) {
        res.status(400).json({ error: '无效的脚本 ID' });
        return;
    }

    const existing = db.select({ id: scripts.id, userId: scripts.userId }).from(scripts).where(eq(scripts.id, id)).get() as any;
    if (!existing) {
        res.status(404).json({ error: '脚本不存在' });
        return;
    }

    const user = getCurrentUser(req);
    if (existing.userId && user?.userId !== existing.userId && user?.role !== 'admin') {
        res.status(403).json({ error: '你没有权限修改此脚本的 Webhook 配置' });
        return;
    }

    // Generate a random 48-char hex token
    const secret = crypto.randomBytes(24).toString('hex');
    db.update(scripts).set({ webhookSecret: secret }).where(eq(scripts.id, id)).run();

    const baseUrl = `${req.protocol}://${req.get('host')}`;
    res.json({
        message: 'Webhook 密钥已生成',
        webhookSecret: secret,
        webhookUrl: `${baseUrl}/api/webhook/scripts/${id}`,
    });
});

// GET /api/scripts/:id/webhook-info - Get webhook config (owner/admin only)
router.get('/:id/webhook-info', requireAuth, (req: Request, res: Response) => {
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) {
        res.status(400).json({ error: '无效的脚本 ID' });
        return;
    }

    const row = db.select({
        id: scripts.id, name: scripts.name, webhookSecret: scripts.webhookSecret,
        githubRepo: scripts.githubRepo, githubPath: scripts.githubPath, canaryVersion: scripts.canaryVersion,
        userId: scripts.userId,
    }).from(scripts).where(eq(scripts.id, id)).get() as any;

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

// PUT /api/scripts/:id/github-config - Set GitHub repo information
router.put('/:id/github-config', requireAuth, (req: Request, res: Response) => {
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) {
        res.status(400).json({ error: '无效的脚本 ID' });
        return;
    }

    const existing = db.select({ id: scripts.id, userId: scripts.userId }).from(scripts).where(eq(scripts.id, id)).get() as any;
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

    res.json({ message: 'GitHub 配置已更新' });
});

// ── .user.js install route (must be after all specific /:id/ routes) ──

// GET /api/scripts/:id/:filename.user.js - Install script via `.user.js` URL
// Userscript managers detect `.user.js` in the URL and prompt installation.
router.get('/:id/:filename.user.js', (req: Request, res: Response) => {
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) {
        res.status(400).type('text/plain').send('无效的脚本 ID');
        return;
    }

    const channel = getChannel(req, res);
    const row = db.select({
        code: scripts.code, canaryCode: scripts.canaryCode,
        canaryVersion: scripts.canaryVersion, filename: scripts.filename,
        version: scripts.version,
    }).from(scripts).where(eq(scripts.id, id)).get() as any;
    if (!row) {
        res.status(404).type('text/plain').send('脚本不存在');
        return;
    }

    const { code, version } = resolveScriptChannel(row, channel);

    // Log installation
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

    // Update install count
    db.update(scripts).set({ installs: sql`"installs" + 1` }).where(eq(scripts.id, id)).run();

    // Serve with filename matching the `.user.js` pattern
    const filename = row.filename || `script-${id}.user.js`;
    res.setHeader('Content-Type', 'text/javascript; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(code);
});

// ── Ratings ──

// GET /api/scripts/:id/ratings - Get rating summary for a script
router.get('/:id/ratings', (req: Request, res: Response) => {
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) {
        res.status(400).json({ error: '无效的脚本 ID' });
        return;
    }

    const [stats] = db.select({
        average: avg(ratings.score),
        count: count(),
    }).from(ratings).where(eq(ratings.scriptId, id)).all();

    // Get user's own rating if logged in
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

// POST /api/scripts/:id/rate - Submit or update a rating (requires auth)
router.post('/:id/rate', requireAuth, writeLimiter, (req: Request, res: Response) => {
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) {
        res.status(400).json({ error: '无效的脚本 ID' });
        return;
    }

    const { score } = req.body;
    if (!Number.isInteger(score) || score < 1 || score > 5) {
        res.status(400).json({ error: '评分必须在 1-5 之间' });
        return;
    }

    // Verify script exists
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

    // Check if user already rated (upsert)
    const existing = db.select({ id: ratings.id }).from(ratings)
        .where(and(eq(ratings.scriptId, id), eq(ratings.userId, currentUser.userId)))
        .get();

    if (existing) {
        db.update(ratings).set({
            score,
            updatedAt: sql`CURRENT_TIMESTAMP`,
        }).where(eq(ratings.id, existing.id)).run();
    } else {
        db.insert(ratings).values({
            scriptId: id,
            userId: currentUser.userId,
            score,
        }).run();
    }

    // Return updated stats
    const [stats] = db.select({
        average: avg(ratings.score),
        count: count(),
    }).from(ratings).where(eq(ratings.scriptId, id)).all();

    res.json({
        message: '评分成功',
        average: stats.average ? Math.round(Number(stats.average) * 10) / 10 : score,
        count: stats.count,
        userRating: score,
    });
});

export default router;
