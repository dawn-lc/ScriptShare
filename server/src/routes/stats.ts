import { Router, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { db } from '../db';
import { scripts, users, installLogs, updateLogs, auditLogs, webhookLogs } from '../db';
import { count, eq, sql, and, desc, gte, ne, lte, like } from 'drizzle-orm';
import { requireAdmin, optionalAuth, getCurrentUser } from '../middleware/auth';
import { audit } from '../utils/audit';
import { dialect } from '../db/dialect';
import { DB_FILENAME } from '../config';

/** 将 Date 对象列表按日期（yyyy-mm-dd）分组。Drizzle ORM 已透明处理方言差异。 */
function groupByDate(rows: { dateKey: Date | null }[]): { date: string; count: number }[] {
    const map = new Map<string, number>();
    for (const r of rows) {
        if (!r.dateKey) continue;
        const d = r.dateKey.toISOString().substring(0, 10);
        map.set(d, (map.get(d) || 0) + 1);
    }
    return [...map.entries()].map(([date, count]) => ({ date, count })).sort((a, b) => a.date.localeCompare(b.date));
}

const router = Router();

const DB_PATH = dialect === 'sqlite'
    ? path.join(__dirname, '..', '..', 'data', DB_FILENAME)
    : ''; /* PostgreSQL 下不适用本地文件路径 */

// GET /api/stats/overview - 全平台统计数据（仅管理员）
router.get('/overview', requireAdmin, (_req: Request, res: Response) => {
    const [{ count: totalScripts }] = db.select({ count: count() }).from(scripts).all();
    const [{ count: totalInstalls }] = db.select({ count: count() }).from(installLogs).all();
    const [{ count: totalUpdates }] = db.select({ count: count() }).from(updateLogs).all();
    const [sumRow] = db.select({ total: sql<number>`COALESCE(SUM(${scripts.updateChecks}), 0)` }).from(scripts).all();
    const totalCheckUps = sumRow?.total ?? 0;

    // 今日统计（与 JS 计算的日边界比较）
    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date();
    dayEnd.setHours(23, 59, 59, 999);

    const [{ count: todayInstalls }] = db.select({ count: count() }).from(installLogs)
        .where(and(gte(installLogs.installedAt, dayStart), lte(installLogs.installedAt, dayEnd))).all();

    const [{ count: todayUpdates }] = db.select({ count: count() }).from(updateLogs)
        .where(and(gte(updateLogs.checkedAt, dayStart), lte(updateLogs.checkedAt, dayEnd))).all();

    // 热门脚本
    const topInstalled = db.select({
        id: scripts.id, name: scripts.name, installs: scripts.installs, updateChecks: scripts.updateChecks,
    }).from(scripts).orderBy(desc(scripts.installs)).limit(10).all();

    const topChecked = db.select({
        id: scripts.id, name: scripts.name, installs: scripts.installs, updateChecks: scripts.updateChecks,
    }).from(scripts).orderBy(desc(scripts.updateChecks)).limit(10).all();

    res.json({
        totalScripts: totalScripts,
        totalInstalls: totalInstalls,
        totalUpdateChecks: totalCheckUps,
        totalUpdateLogs: totalUpdates,
        todayInstalls: todayInstalls,
        todayUpdates: todayUpdates,
        topInstalled: topInstalled,
        topChecked: topChecked,
    });
});

// GET /api/stats/scripts/:id - 指定脚本的统计（所有者或管理员）
router.get('/scripts/:id', optionalAuth, (req: Request, res: Response) => {
    const id = parseInt(String(req.params.id));
    if (isNaN(id)) {
        res.status(400).json({ error: '无效的脚本 ID' });
        return;
    }

    const currentUser = getCurrentUser(req);
    const script = db.select({
        id: scripts.id, name: scripts.name, version: scripts.version,
        installs: scripts.installs, updateChecks: scripts.updateChecks, userId: scripts.userId,
    }).from(scripts).where(eq(scripts.id, id)).get();
    if (!script) {
        res.status(404).json({ error: '脚本不存在' });
        return;
    }

    // 检查权限：管理员或所有者
    const isOwner = currentUser && (currentUser.role === 'admin' || currentUser.userId === script.userId);
    if (!isOwner) {
        res.status(403).json({ error: '无权查看此脚本的统计' });
        return;
    }

    // 每日安装/更新检查（最近 30 天）— Drizzle ORM 透明处理方言差异
    const cutoff30 = new Date(Date.now() - 30 * 86400000);
    const installRows = db.select({ dateKey: installLogs.installedAt }).from(installLogs)
        .where(and(eq(installLogs.scriptId, id), gte(installLogs.installedAt, cutoff30))).all() as { dateKey: Date | null }[];
    const dailyInstalls = groupByDate(installRows);

    const updateRows = db.select({ dateKey: updateLogs.checkedAt }).from(updateLogs)
        .where(and(eq(updateLogs.scriptId, id), gte(updateLogs.checkedAt, cutoff30))).all() as { dateKey: Date | null }[];
    const dailyUpdates = groupByDate(updateRows);

    // 浏览器统计
    const browserStats = db.select({
        browser: installLogs.browser,
        count: count(),
    }).from(installLogs)
        .where(and(eq(installLogs.scriptId, id), ne(installLogs.browser, '')))
        .groupBy(installLogs.browser)
        .orderBy(desc(count()))
        .limit(10)
        .all();

    // 操作系统统计
    const osStats = db.select({
        os: installLogs.os,
        count: count(),
    }).from(installLogs)
        .where(and(eq(installLogs.scriptId, id), ne(installLogs.os, '')))
        .groupBy(installLogs.os)
        .orderBy(desc(count()))
        .limit(10)
        .all();

    // ── Webhook / 审计日志（最近 20 条） ──
    const webhookLogsList = db.select({
        id: webhookLogs.id, event: webhookLogs.event, action: webhookLogs.action,
        summary: webhookLogs.summary, detail: webhookLogs.detail, createdAt: webhookLogs.createdAt,
    }).from(webhookLogs)
        .where(eq(webhookLogs.scriptId, id))
        .orderBy(desc(webhookLogs.createdAt))
        .limit(20)
        .all();

    const auditLogsList = db.select({
        id: auditLogs.id, action: auditLogs.action, detail: auditLogs.detail,
        metadata: auditLogs.metadata, createdAt: auditLogs.createdAt,
    }).from(auditLogs)
        .where(and(eq(auditLogs.userId, script.userId ?? 0), like(auditLogs.detail, `%脚本 ID=${id}%`)))
        .orderBy(desc(auditLogs.createdAt))
        .limit(20)
        .all();

    // 按时间排序取前 20 条
    auditLogsList.sort((a: { createdAt?: string }, b: { createdAt?: string }) => b.createdAt?.localeCompare(a.createdAt ?? '') ?? 0);
    const mergedAudit = auditLogsList.slice(0, 20);

    res.json({
        script: { id: script.id, name: script.name, version: script.version },
        totalInstalls: script.installs,
        totalUpdateChecks: script.updateChecks,
        dailyInstalls: dailyInstalls,
        dailyUpdates: dailyUpdates,
        browserStats: browserStats,
        osStats: osStats,
        webhookLogs: webhookLogsList,
        auditLogs: mergedAudit,
    });
});

// GET /api/stats/trends - 全平台趋势数据（仅管理员）
router.get('/trends', requireAdmin, (req: Request, res: Response) => {
    audit('admin.access', getCurrentUser(req)?.userId ?? null, `管理员查看全平台趋势`, {});
    const period = parseInt(String(req.query.days ?? '')) || 30;

    // 每日安装趋势 — Drizzle ORM 透明处理方言差异
    const trendCutoff = new Date(Date.now() - period * 86400000);
    const trendInstallRows = db.select({ dateKey: installLogs.installedAt }).from(installLogs)
        .where(gte(installLogs.installedAt, trendCutoff)).all() as { dateKey: Date | null }[];
    const installTrend = groupByDate(trendInstallRows);

    // 每日更新检查趋势
    const trendUpdateRows = db.select({ dateKey: updateLogs.checkedAt }).from(updateLogs)
        .where(gte(updateLogs.checkedAt, trendCutoff)).all() as { dateKey: Date | null }[];
    const updateTrend = groupByDate(trendUpdateRows);

    // 浏览器分布
    const browserDist = db.select({
        browser: installLogs.browser,
        count: count(),
    }).from(installLogs)
        .where(ne(installLogs.browser, ''))
        .groupBy(installLogs.browser)
        .orderBy(desc(count()))
        .limit(10)
        .all();

    // 操作系统分布
    const osDist = db.select({
        os: installLogs.os,
        count: count(),
    }).from(installLogs)
        .where(ne(installLogs.os, ''))
        .groupBy(installLogs.os)
        .orderBy(desc(count()))
        .limit(10)
        .all();

    res.json({
        period,
        installTrend: installTrend,
        updateTrend: updateTrend,
        browserDistribution: browserDist,
        osDistribution: osDist,
    });
});

// ── 用户个人统计 ──

// GET /api/stats/my - 当前用户脚本的聚合统计
router.get('/my', optionalAuth, (req: Request, res: Response) => {
    const currentUser = getCurrentUser(req);
    if (!currentUser) {
        res.status(401).json({ error: '请先登录' });
        return;
    }

    const userId = currentUser.userId!;

    // 我的脚本
    const myScripts = db.select({
        id: scripts.id, name: scripts.name, version: scripts.version,
        installs: scripts.installs, updateChecks: scripts.updateChecks,
        createdAt: scripts.createdAt, updatedAt: scripts.updatedAt,
    }).from(scripts).where(eq(scripts.userId, userId)).orderBy(desc(scripts.updatedAt)).all();

    // 聚合统计
    const totalScripts = myScripts.length;
    const totalInstalls = myScripts.reduce((sum: number, s: { installs: number; updateChecks: number }) => sum + s.installs, 0);
    const totalChecks = myScripts.reduce((sum: number, s: { installs: number; updateChecks: number }) => sum + s.updateChecks, 0);

    // 每日安装趋势（覆盖我所有脚本）
    const myCutoff = new Date(Date.now() - 30 * 86400000);
    // db 为 Proxy 动态类型，联表查询返回类型无法静态推导
    const myInstallRows = db.select({ dateKey: installLogs.installedAt }).from(installLogs)
        .innerJoin(scripts, eq(scripts.id, installLogs.scriptId))
        .where(and(eq(scripts.userId, userId), gte(installLogs.installedAt, myCutoff)))
        .all() as { dateKey: Date | null }[];
    const dailyInstalls = groupByDate(myInstallRows);

    // 安装量最多的脚本
    const topScripts = [...myScripts].sort((a, b) => b.installs - a.installs).slice(0, 5);

    res.json({
        totalScripts: totalScripts,
        totalInstalls: totalInstalls,
        totalUpdateChecks: totalChecks,
        dailyInstalls: dailyInstalls,
        scripts: myScripts,
        topScripts: topScripts,
    });
});

// ── 管理员专属端点 ──

// GET /api/stats/admin/users - 所有用户及其脚本数
router.get('/admin/users', requireAdmin, (req: Request, res: Response) => {
    audit('admin.access', getCurrentUser(req)?.userId ?? null, '管理员查看用户列表', {});
    const userList = db.select({
        id: users.id, username: users.username, displayName: users.displayName,
        role: users.role, avatarUrl: users.avatarUrl,
        createdAt: users.createdAt, updatedAt: users.updatedAt,
        scriptCount: count(scripts.id),
    }).from(users)
        .leftJoin(scripts, eq(scripts.userId, users.id))
        .orderBy(desc(users.createdAt))
        .groupBy(users.id)
        .all();
    res.json({ users: userList });
});

// GET /api/stats/admin/audit-logs - 最近的审计日志（支持分页）
// 注意：不在此记录审计，避免自指（审计日志本身的操作产生额外审计条目）
router.get('/admin/audit-logs', requireAdmin, (req: Request, res: Response) => {
    const limit = Math.min(parseInt(String(req.query.limit ?? '')) || 50, 200);
    const offset = Math.max(parseInt(String(req.query.offset ?? '')) || 0, 0);

    // 获取总数（用于前端判断是否还有更多）
    const [{ total }] = db.select({ total: count() }).from(auditLogs).all();

    const logs = db.select({
        id: auditLogs.id, action: auditLogs.action, userId: auditLogs.userId,
        detail: auditLogs.detail, metadata: auditLogs.metadata, createdAt: auditLogs.createdAt,
        userName: users.username,
    }).from(auditLogs)
        .leftJoin(users, eq(users.id, auditLogs.userId))
        .orderBy(desc(auditLogs.createdAt))
        .limit(limit)
        .offset(offset)
        .all();

    res.json({ logs, total, hasMore: offset + limit < total });
});

// GET /api/stats/admin/webhook-logs - 最近的 Webhook 事件
router.get('/admin/webhook-logs', requireAdmin, (req: Request, res: Response) => {
    const limit = Math.min(parseInt(String(req.query.limit ?? '')) || 50, 200);
    audit('admin.access', getCurrentUser(req)?.userId ?? null, '管理员查看 Webhook 日志', { limit });

    const logs = db.select({
        id: webhookLogs.id, event: webhookLogs.event, action: webhookLogs.action,
        summary: webhookLogs.summary, detail: webhookLogs.detail, createdAt: webhookLogs.createdAt,
        scriptName: scripts.name,
    }).from(webhookLogs)
        .leftJoin(scripts, eq(scripts.id, webhookLogs.scriptId))
        .orderBy(desc(webhookLogs.createdAt))
        .limit(limit)
        .all();

    res.json({ logs });
});

// GET /api/stats/admin/system - 系统信息
router.get('/admin/system', requireAdmin, (req: Request, res: Response) => {
    audit('admin.access', getCurrentUser(req)?.userId ?? null, '管理员查看系统信息', {});
    // 数据库信息（SQLite 下获取文件大小，PostgreSQL 下标记为 N/A）
    const dbSize = DB_PATH ? fs.statSync(DB_PATH).size : 0;
    const [{ c: scriptCount }] = db.select({ c: count() }).from(scripts).all();
    const [{ c: userCount }] = db.select({ c: count() }).from(users).all();
    const [{ c: installCount }] = db.select({ c: count() }).from(installLogs).all();
    const [{ c: updateCount }] = db.select({ c: count() }).from(updateLogs).all();
    const [{ c: webhookCount }] = db.select({ c: count() }).from(webhookLogs).all();
    const [{ c: auditCount }] = db.select({ c: count() }).from(auditLogs).all();

    // 每个用户的脚本数
    const scriptsPerUser = db.select({
        username: users.username,
        displayName: users.displayName,
        scriptCount: count(scripts.id),
    }).from(users)
        .leftJoin(scripts, eq(scripts.userId, users.id))
        .groupBy(users.id)
        .orderBy(desc(count(scripts.id)))
        .all();

    // 最近脚本
    const recentScripts = db.select({
        id: scripts.id, name: scripts.name, version: scripts.version,
        installs: scripts.installs, createdAt: scripts.createdAt,
        owner: users.username,
    }).from(scripts)
        .leftJoin(users, eq(users.id, scripts.userId))
        .orderBy(desc(scripts.createdAt))
        .limit(10)
        .all();

    res.json({
        system: {
            nodeVersion: process.version,
            platform: process.platform,
            uptimeSeconds: Math.floor(process.uptime()),
        },
        database: {
            sizeBytes: dbSize,
            sizeMb: DB_PATH ? (dbSize / 1024 / 1024).toFixed(2) : 'N/A',
            scripts: scriptCount,
            users: userCount,
            installs: installCount,
            updates: updateCount,
            webhookLogs: webhookCount,
            auditLogs: auditCount,
        },
        scriptsPerUser: scriptsPerUser,
        recentScripts: recentScripts,
    });
});

export default router;
