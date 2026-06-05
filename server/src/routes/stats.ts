import { Router, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { db } from '../db';
import { scripts, users, installLogs, updateLogs, auditLogs, webhookLogs } from '../db';
import { count, eq, sql, and, desc, gte, ne, lte } from 'drizzle-orm';
import { requireAdmin, optionalAuth, getCurrentUser } from '../middleware/auth';

/** Group DB rows with a dateKey field by date (yyyy-mm-dd), returning sorted counts. */
function groupByDate(rows: { dateKey: string | null }[]): { date: string; count: number }[] {
    const map = new Map<string, number>();
    for (const r of rows) {
        const d = r.dateKey?.substring(0, 10) ?? '';
        if (d) map.set(d, (map.get(d) || 0) + 1);
    }
    return [...map.entries()].map(([date, count]) => ({ date, count })).sort((a, b) => a.date.localeCompare(b.date));
}

const router = Router();

const DB_PATH = path.join(__dirname, '..', '..', 'data', 'scriptshare.db');

// GET /api/stats/overview - Overall platform statistics (public, no auth required)
router.get('/overview', (_req: Request, res: Response) => {
    const [{ count: totalScripts }] = db.select({ count: count() }).from(scripts).all();
    const [{ count: totalInstalls }] = db.select({ count: count() }).from(installLogs).all();
    const [{ count: totalUpdates }] = db.select({ count: count() }).from(updateLogs).all();
    const [sumRow] = db.select({ total: sql<number>`COALESCE(SUM("updateChecks"), 0)` }).from(scripts).all();
    const totalCheckUps = sumRow?.total ?? 0;

    // Today's stats (compare against JS-calculated day boundaries)
    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date();
    dayEnd.setHours(23, 59, 59, 999);

    const [{ count: todayInstalls }] = db.select({ count: count() }).from(installLogs)
        .where(and(gte(installLogs.installedAt, dayStart.toISOString()), lte(installLogs.installedAt, dayEnd.toISOString()))).all();

    const [{ count: todayUpdates }] = db.select({ count: count() }).from(updateLogs)
        .where(and(gte(updateLogs.checkedAt, dayStart.toISOString()), lte(updateLogs.checkedAt, dayEnd.toISOString()))).all();

    // Top scripts
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

// GET /api/stats/scripts/:id - Statistics for a specific script (owner or admin)
router.get('/scripts/:id', optionalAuth, (req: Request, res: Response) => {
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) {
        res.status(400).json({ error: '无效的脚本 ID' });
        return;
    }

    const currentUser = getCurrentUser(req);
    const script = db.select({
        id: scripts.id, name: scripts.name, version: scripts.version,
        installs: scripts.installs, updateChecks: scripts.updateChecks, userId: scripts.userId,
    }).from(scripts).where(eq(scripts.id, id)).get() as any;
    if (!script) {
        res.status(404).json({ error: '脚本不存在' });
        return;
    }

    // Check permission: admin or owner
    const isOwner = currentUser && (currentUser.role === 'admin' || currentUser.userId === script.userId);
    if (!isOwner) {
        res.status(403).json({ error: '无权查看此脚本的统计' });
        return;
    }

    // Daily installs / update checks (last 30 days) — aggregate in JS for DB portability
    const cutoff30 = new Date(Date.now() - 30 * 86400000).toISOString();
    const installRows = db.select({ dateKey: installLogs.installedAt }).from(installLogs)
        .where(and(eq(installLogs.scriptId, id), gte(installLogs.installedAt, cutoff30))).all();
    const dailyInstalls = groupByDate(installRows);

    const updateRows = db.select({ dateKey: updateLogs.checkedAt }).from(updateLogs)
        .where(and(eq(updateLogs.scriptId, id), gte(updateLogs.checkedAt, cutoff30))).all();
    const dailyUpdates = groupByDate(updateRows);

    // Browser stats
    const browserStats = db.select({
        browser: installLogs.browser,
        count: count(),
    }).from(installLogs)
        .where(and(eq(installLogs.scriptId, id), ne(installLogs.browser, '')))
        .groupBy(installLogs.browser)
        .orderBy(desc(count()))
        .limit(10)
        .all();

    // OS stats
    const osStats = db.select({
        os: installLogs.os,
        count: count(),
    }).from(installLogs)
        .where(and(eq(installLogs.scriptId, id), ne(installLogs.os, '')))
        .groupBy(installLogs.os)
        .orderBy(desc(count()))
        .limit(10)
        .all();

    res.json({
        script: { id: script.id, name: script.name, version: script.version },
        totalInstalls: script.installs,
        totalUpdateChecks: script.updateChecks,
        dailyInstalls: dailyInstalls,
        dailyUpdates: dailyUpdates,
        browserStats: browserStats,
        osStats: osStats,
    });
});

// GET /api/stats/trends - Overall trend data (admin only)
router.get('/trends', requireAdmin, (_req: Request, res: Response) => {
    const period = parseInt(_req.query.days as string) || 30;

    // Daily installs trend — aggregate in JS
    const trendCutoff = new Date(Date.now() - period * 86400000).toISOString();
    const trendInstallRows = db.select({ dateKey: installLogs.installedAt }).from(installLogs)
        .where(gte(installLogs.installedAt, trendCutoff)).all();
    const installTrend = groupByDate(trendInstallRows);

    // Daily update checks trend
    const trendUpdateRows = db.select({ dateKey: updateLogs.checkedAt }).from(updateLogs)
        .where(gte(updateLogs.checkedAt, trendCutoff)).all();
    const updateTrend = groupByDate(trendUpdateRows);

    // Browser distribution
    const browserDist = db.select({
        browser: installLogs.browser,
        count: count(),
    }).from(installLogs)
        .where(ne(installLogs.browser, ''))
        .groupBy(installLogs.browser)
        .orderBy(desc(count()))
        .limit(10)
        .all();

    // OS distribution
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

// ── User's own stats ──

// GET /api/stats/my - Aggregate stats for current user's scripts
router.get('/my', optionalAuth, (req: Request, res: Response) => {
    const currentUser = getCurrentUser(req);
    if (!currentUser) {
        res.status(401).json({ error: '请先登录' });
        return;
    }

    const userId = currentUser.userId!;

    // My scripts
    const myScripts = db.select({
        id: scripts.id, name: scripts.name, version: scripts.version,
        installs: scripts.installs, updateChecks: scripts.updateChecks,
        createdAt: scripts.createdAt, updatedAt: scripts.updatedAt,
    }).from(scripts).where(eq(scripts.userId, userId)).orderBy(desc(scripts.updatedAt)).all();

    // Aggregate stats
    const totalScripts = myScripts.length;
    const totalInstalls = myScripts.reduce((sum: number, s: any) => sum + s.installs, 0);
    const totalChecks = myScripts.reduce((sum: number, s: any) => sum + s.updateChecks, 0);

    // Daily installs trend (across all my scripts)
    const myCutoff = new Date(Date.now() - 30 * 86400000).toISOString();
    const myInstallRows = db.select({ dateKey: installLogs.installedAt }).from(installLogs)
        .innerJoin(scripts, eq(scripts.id, installLogs.scriptId))
        .where(and(eq(scripts.userId, userId), gte(installLogs.installedAt, myCutoff)))
        .all() as { dateKey: string | null }[];
    const dailyInstalls = groupByDate(myInstallRows);

    // Top scripts by installs
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

// ── Admin-only endpoints ──

// GET /api/stats/admin/users - All users with script counts
router.get('/admin/users', requireAdmin, (_req: Request, res: Response) => {
    const userList = db.select({
        id: users.id, username: users.username, displayName: users.displayName,
        role: users.role, avatarUrl: users.avatarUrl,
        createdAt: users.createdAt, updatedAt: users.updatedAt, envInfo: users.envInfo,
        scriptCount: count(scripts.id),
    }).from(users)
        .leftJoin(scripts, eq(scripts.userId, users.id))
        .orderBy(desc(users.createdAt))
        .groupBy(users.id)
        .all();
    res.json({ users: userList });
});

// GET /api/stats/admin/audit-logs - Recent audit log entries
router.get('/admin/audit-logs', requireAdmin, (req: Request, res: Response) => {
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);

    const logs = db.select({
        id: auditLogs.id, action: auditLogs.action, userId: auditLogs.userId,
        detail: auditLogs.detail, metadata: auditLogs.metadata, createdAt: auditLogs.createdAt,
        userName: users.username,
    }).from(auditLogs)
        .leftJoin(users, eq(users.id, auditLogs.userId))
        .orderBy(desc(auditLogs.createdAt))
        .limit(limit)
        .all();

    res.json({ logs });
});

// GET /api/stats/admin/webhook-logs - Recent webhook events
router.get('/admin/webhook-logs', requireAdmin, (req: Request, res: Response) => {
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);

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

// GET /api/stats/admin/system - System information
router.get('/admin/system', requireAdmin, (_req: Request, res: Response) => {
    // Database info
    const dbSize = fs.statSync(DB_PATH).size;
    const [{ c: scriptCount }] = db.select({ c: count() }).from(scripts).all();
    const [{ c: userCount }] = db.select({ c: count() }).from(users).all();
    const [{ c: installCount }] = db.select({ c: count() }).from(installLogs).all();
    const [{ c: updateCount }] = db.select({ c: count() }).from(updateLogs).all();
    const [{ c: webhookCount }] = db.select({ c: count() }).from(webhookLogs).all();
    const [{ c: auditCount }] = db.select({ c: count() }).from(auditLogs).all();

    // Scripts per user
    const scriptsPerUser = db.select({
        username: users.username,
        displayName: users.displayName,
        scriptCount: count(scripts.id),
    }).from(users)
        .leftJoin(scripts, eq(scripts.userId, users.id))
        .groupBy(users.id)
        .orderBy(desc(count(scripts.id)))
        .all();

    // Recent scripts
    const recentScripts = db.select({
        id: scripts.id, name: scripts.name, version: scripts.version,
        installs: scripts.installs, createdAt: scripts.createdAt,
        owner: users.username,
    }).from(scripts)
        .leftJoin(users, eq(users.id, scripts.userId))
        .orderBy(desc(scripts.createdAt))
        .limit(10)
        .all() as any[];

    res.json({
        system: {
            nodeVersion: process.version,
            platform: process.platform,
            uptimeSeconds: Math.floor(process.uptime()),
        },
        database: {
            sizeBytes: dbSize,
            sizeMb: (dbSize / 1024 / 1024).toFixed(2),
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
