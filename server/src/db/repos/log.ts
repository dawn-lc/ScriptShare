/**
 * 操作日志仓库。
 */
import { eq, and, gte, count as drizzleCount, ne, desc } from 'drizzle-orm';
import { db } from '../index';
import { installLogs, updateLogs, scripts } from '../schema';
import { getCache, setCache, invalidateCache } from '../../utils/cache';

// ── 类型从 schema 直接推导 ──
type InstallLog = typeof installLogs.$inferSelect;
type NewInstallLog = typeof installLogs.$inferInsert;
type UpdateLog = typeof updateLogs.$inferSelect;
type NewUpdateLog = typeof updateLogs.$inferInsert;

// ── 自定义接口 ──
interface TrendItem { date: string; count: number; }


export const logRepo = {
    // ── Install Logs ──

    /** 记录安装 */
    async createInstall(data: NewInstallLog): Promise<void> {
        await db.insert(installLogs).values(data);
        invalidateCache('log:');
    },

    /** 查询脚本的安装日志 */
    async findInstallsByScriptId(scriptId: number, limit?: number, offset?: number): Promise<InstallLog[]> {
        const base = db.select().from(installLogs).where(eq(installLogs.scriptId, scriptId)).orderBy(installLogs.installedAt);
        const withLimit = limit ? base.limit(limit) : base;
        return offset ? withLimit.offset(offset) : withLimit;
    },

    /** 安装总数 */
    async countInstalls(): Promise<number> {
        const [row] = await db.select({ count: drizzleCount() }).from(installLogs);
        return row?.count ?? 0;
    },

    /** 今日安装数 */
    async countTodayInstalls(dayStart: number): Promise<number> {
        const [row] = await db.select({ count: drizzleCount() }).from(installLogs)
            .where(gte(installLogs.installedAt, new Date(dayStart)));
        return row?.count ?? 0;
    },

    /** 脚本每日安装趋势 */
    async getDailyInstallsByScript(scriptId: number, since: Date): Promise<{ dateKey: Date | null }[]> {
        return db.select({ dateKey: installLogs.installedAt }).from(installLogs)
            .where(and(eq(installLogs.scriptId, scriptId), gte(installLogs.installedAt, since)));
    },

    /** 脚本每日更新趋势 */
    async getDailyUpdatesByScript(scriptId: number, since: Date): Promise<{ dateKey: Date | null }[]> {
        return db.select({ dateKey: updateLogs.checkedAt }).from(updateLogs)
            .where(and(eq(updateLogs.scriptId, scriptId), gte(updateLogs.checkedAt, since)));
    },

    /** 浏览器分布统计 */
    async getBrowserStatsByScript(scriptId: number): Promise<{ browser: string | null; count: number }[]> {
        return db.select({ browser: installLogs.browser, count: drizzleCount() }).from(installLogs)
            .where(and(eq(installLogs.scriptId, scriptId), ne(installLogs.browser, '')))
            .groupBy(installLogs.browser)
            .orderBy(desc(drizzleCount()))
            .limit(10);
    },

    /** 操作系统分布统计 */
    async getOsStatsByScript(scriptId: number): Promise<{ os: string | null; count: number }[]> {
        return db.select({ os: installLogs.os, count: drizzleCount() }).from(installLogs)
            .where(and(eq(installLogs.scriptId, scriptId), ne(installLogs.os, '')))
            .groupBy(installLogs.os)
            .orderBy(desc(drizzleCount()))
            .limit(10);
    },

    /** 用户脚本的每日安装趋势 */
    async getDailyInstallsByUser(userId: number, since: Date): Promise<{ dateKey: Date | null }[]> {
        return db.select({ dateKey: installLogs.installedAt }).from(installLogs)
            .innerJoin(scripts, eq(scripts.id, installLogs.scriptId))
            .where(and(eq(scripts.userId, userId), gte(installLogs.installedAt, since)));
    },

    /** 按日分组安装趋势 */
    async getInstallTrend(limit: number): Promise<TrendItem[]> {
        const cacheKey = `log:installTrend:${limit}`;
        const cached = getCache<TrendItem[]>(cacheKey);
        if (cached) return cached;
        const rows = await db.select({ dateKey: installLogs.installedAt }).from(installLogs)
            .orderBy(installLogs.installedAt);
        const result = aggregateByDate(rows);
        setCache(cacheKey, result, 120_000);
        return result;
    },

    /** 浏览器分布 */
    async getBrowserDistribution(limit: number): Promise<{ name: string | null; count: number }[]> {
        const cacheKey = `log:browserDist:${limit}`;
        const cached = getCache<{ name: string | null; count: number }[]>(cacheKey);
        if (cached) return cached;
        const result = await db.select({ name: installLogs.browser, count: drizzleCount() }).from(installLogs)
            .groupBy(installLogs.browser).orderBy(desc(drizzleCount())).limit(limit);
        setCache(cacheKey, result, 120_000);
        return result;
    },

    /** OS 分布 */
    async getOsDistribution(limit: number): Promise<{ name: string | null; count: number }[]> {
        const cacheKey = `log:osDist:${limit}`;
        const cached = getCache<{ name: string | null; count: number }[]>(cacheKey);
        if (cached) return cached;
        const result = await db.select({ name: installLogs.os, count: drizzleCount() }).from(installLogs)
            .groupBy(installLogs.os).orderBy(desc(drizzleCount())).limit(limit);
        setCache(cacheKey, result, 120_000);
        return result;
    },

    /** 删除所有安装日志（调试用） */
    async deleteAllInstalls(): Promise<void> {
        await db.delete(installLogs);
    },

    // ── Update Logs ──

    /** 记录更新检查 */
    async createUpdate(data: NewUpdateLog): Promise<void> {
        await db.insert(updateLogs).values(data);
        invalidateCache('log:');
    },

    /** 更新检查总数 */
    async countUpdates(): Promise<number> {
        const [row] = await db.select({ count: drizzleCount() }).from(updateLogs);
        return row?.count ?? 0;
    },

    /** 今日更新检查数 */
    async countTodayUpdates(dayStart: number): Promise<number> {
        const [row] = await db.select({ count: drizzleCount() }).from(updateLogs)
            .where(gte(updateLogs.checkedAt, new Date(dayStart)));
        return row?.count ?? 0;
    },

    /** 按日分组更新趋势 */
    async getUpdateTrend(limit: number): Promise<TrendItem[]> {
        const cacheKey = `log:updateTrend:${limit}`;
        const cached = getCache<TrendItem[]>(cacheKey);
        if (cached) return cached;
        const rows = await db.select({ dateKey: updateLogs.checkedAt }).from(updateLogs)
            .orderBy(updateLogs.checkedAt);
        const result = aggregateByDate(rows);
        setCache(cacheKey, result, 120_000);
        return result;
    },

    /** 删除所有更新日志（调试用） */
    async deleteAllUpdates(): Promise<void> {
        await db.delete(updateLogs);
    },
};

// ── Helpers ──

function aggregateByDate(rows: { dateKey: Date | null }[]): TrendItem[] {
    const map = new Map<string, number>();
    for (const r of rows) {
        if (!r.dateKey) continue;
        const d = r.dateKey.toISOString().substring(0, 10);
        map.set(d, (map.get(d) || 0) + 1);
    }
    return [...map.entries()]
        .map(([date, count]) => ({ date, count }))
        .sort((a, b) => a.date.localeCompare(b.date));
}
