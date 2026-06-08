import { Router, Request, Response } from 'express';
import { requireAdmin, optionalAuth, getCurrentUser } from '../middleware/auth';
import { audit } from '../utils/audit';
import { scriptRepo, logRepo, webhookRepo, auditRepo, userRepo } from '../db/repos';
import { pgPool } from '../db';




/** 将 Date 对象列表按日期（yyyy-mm-dd）分组。 */
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



// GET /api/stats/overview - 全平台统计数据（公开数据如排行榜对所有用户可见，详细统计仅管理员可见）
router.get('/overview', optionalAuth, async (_req: Request, res: Response) => {
    const [totalScripts, totalInstalls, totalUpdates] = await Promise.all([
        scriptRepo.count(),
        logRepo.countInstalls(),
        logRepo.countUpdates(),
    ]);

    const totalCheckUps = await scriptRepo.getTotalUpdateChecks();

    // 今日统计（与 JS 计算的日边界比较）
    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);

    const [todayInstalls, todayUpdates] = await Promise.all([
        logRepo.countTodayInstalls(dayStart.getTime()),
        logRepo.countTodayUpdates(dayStart.getTime()),
    ]);

    // 热门脚本
    const topInstalled = await scriptRepo.getTopInstalled(10);
    const topChecked = await scriptRepo.getTopChecked(10);

    res.json({
        totalScripts,
        totalInstalls,
        totalUpdateChecks: totalCheckUps,
        totalUpdateLogs: totalUpdates,
        todayInstalls,
        todayUpdates,
        topInstalled,
        topChecked,
    });
});

// GET /api/stats/scripts/:id - 指定脚本的统计（所有者或管理员）
router.get('/scripts/:id', optionalAuth, async (req: Request, res: Response) => {
    const id = parseInt(String(req.params.id));
    if (isNaN(id)) {
        res.status(400).json({ error: '无效的脚本 ID' });
        return;
    }

    const currentUser = getCurrentUser(req);
    const script = await scriptRepo.findByIdColumns(id, {
        id: true, name: true, version: true,
        installs: true, updateChecks: true, userId: true,
    });
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

    // 每日安装/更新检查（最近 30 天）
    const cutoff30 = new Date(Date.now() - 30 * 86400000);
    const installRows = await logRepo.getDailyInstallsByScript(id, cutoff30);
    const dailyInstalls = groupByDate(installRows);

    const updateRows = await logRepo.getDailyUpdatesByScript(id, cutoff30);
    const dailyUpdates = groupByDate(updateRows);

    // 浏览器 / 操作系统统计
    const browserStats = await logRepo.getBrowserStatsByScript(id);
    const osStats = await logRepo.getOsStatsByScript(id);

    // ── Webhook / 审计日志（最近 20 条） ──
    const webhookLogsList = await webhookRepo.findByScriptId(id, 20);

    const auditLogsList = await auditRepo.findByUserId(script.userId ?? 0);
    const mergedAudit = auditLogsList
        .filter(a => a.detail?.includes(`脚本 ID=${id}`))
        .slice(0, 20);

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
router.get('/trends', requireAdmin, async (req: Request, res: Response) => {
    audit('admin.access', getCurrentUser(req)?.userId ?? null, `管理员查看全平台趋势`, {});
    const period = parseInt(String(req.query.days ?? '')) || 30;

    // 每日安装趋势
    const installTrend = await logRepo.getInstallTrend(period);

    // 每日更新检查趋势
    const updateTrend = await logRepo.getUpdateTrend(period);

    // 浏览器分布
    const browserDist = await logRepo.getBrowserDistribution(10);

    // 操作系统分布
    const osDist = await logRepo.getOsDistribution(10);

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
router.get('/my', optionalAuth, async (req: Request, res: Response) => {
    const currentUser = getCurrentUser(req);
    if (!currentUser) {
        res.status(401).json({ error: '请先登录' });
        return;
    }

    const userId = currentUser.userId!;

    // 我的脚本
    const myScripts = await scriptRepo.findByUserId(userId);

    // 聚合统计
    const totalScripts = myScripts.length;
    const totalInstalls = myScripts.reduce((sum, s) => sum + s.installs, 0);
    const totalChecks = myScripts.reduce((sum, s) => sum + s.updateChecks, 0);

    // 每日安装趋势（覆盖我所有脚本）
    const myCutoff = new Date(Date.now() - 30 * 86400000);
    const myInstallRows = await logRepo.getDailyInstallsByUser(userId, myCutoff);
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
router.get('/admin/users', requireAdmin, async (req: Request, res: Response) => {
    audit('admin.access', getCurrentUser(req)?.userId ?? null, '管理员查看用户列表', {});
    const userList = await userRepo.findAllWithScriptCount();
    res.json({ users: userList });
});

// GET /api/stats/admin/audit-logs - 最近的审计日志（支持分页）
// 注意：不在此记录审计，避免自指（审计日志本身的操作产生额外审计条目）
router.get('/admin/audit-logs', requireAdmin, async (req: Request, res: Response) => {
    const limit = Math.min(parseInt(String(req.query.limit ?? '')) || 50, 200);
    const offset = Math.max(parseInt(String(req.query.offset ?? '')) || 0, 0);

    // 获取总数（用于前端判断是否还有更多）
    const total = await auditRepo.count();

    const logs = await auditRepo.findRecentWithUser(limit, offset);

    res.json({ logs, total, hasMore: offset + limit < total });
});

// GET /api/stats/admin/webhook-logs - 最近的 Webhook 事件
router.get('/admin/webhook-logs', requireAdmin, async (req: Request, res: Response) => {
    const limit = Math.min(parseInt(String(req.query.limit ?? '')) || 50, 200);
    audit('admin.access', getCurrentUser(req)?.userId ?? null, '管理员查看 Webhook 日志', { limit });

    const logs = await webhookRepo.findRecentWithScript(limit);

    res.json({ logs });
});

// GET /api/stats/admin/system - 系统信息
router.get('/admin/system', requireAdmin, async (req: Request, res: Response) => {
    audit('admin.access', getCurrentUser(req)?.userId ?? null, '管理员查看系统信息', {});
    const dbSize = pgPool ? (await pgPool.query('SELECT pg_database_size(current_database()) as size')).rows[0]?.size ?? 0 : 0;
    const [scriptCount, userCount, installCount, updateCount, webhookCount, auditCount] = await Promise.all([
        scriptRepo.count(),
        userRepo.count(),
        logRepo.countInstalls(),
        logRepo.countUpdates(),
        webhookRepo.count(),
        auditRepo.count(),
    ]);

    // 每个用户的脚本数
    const scriptsPerUser = await userRepo.getScriptsPerUser();

    // 最近脚本
    const recentScripts = await scriptRepo.findRecentWithOwner(10);

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
        scriptsPerUser,
        recentScripts,
    });
});

export default router;
