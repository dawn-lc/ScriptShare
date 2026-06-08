/**
 * Webhook 日志仓库。
 */
import { eq, desc, count as drizzleCount } from 'drizzle-orm';
import { db } from '../index';
import { webhookLogs, scripts } from '../schema';

// ── 类型从 schema 直接推导 ──
type WebhookLog = typeof webhookLogs.$inferSelect;
type NewWebhookLog = typeof webhookLogs.$inferInsert;


export const webhookRepo = {
    /** 记录 webhook 事件 */
    async create(data: NewWebhookLog): Promise<void> {
        await db.insert(webhookLogs).values(data);
    },

    /** 按脚本查询 */
    async findByScriptId(scriptId: number, limit?: number): Promise<WebhookLog[]> {
        const base = db.select().from(webhookLogs).where(eq(webhookLogs.scriptId, scriptId)).orderBy(desc(webhookLogs.createdAt));
        return limit ? base.limit(limit) : base;
    },

    /** 最新的 webhook 日志 */
    async findRecent(limit: number, offset?: number): Promise<WebhookLog[]> {
        const base = db.select().from(webhookLogs).orderBy(desc(webhookLogs.createdAt)).limit(limit);
        return offset ? base.offset(offset) : base;
    },

    /** Webhook 日志总数 */
    async count(): Promise<number> {
        const [row] = await db.select({ count: drizzleCount() }).from(webhookLogs);
        return row?.count ?? 0;
    },

    /** 最近的 webhook 日志（含脚本名） */
    async findRecentWithScript(limit: number): Promise<{ id: number; event: string; action: string; summary: string | null; detail: unknown; createdAt: Date | null; scriptName: string | null }[]> {
        return db.select({
            id: webhookLogs.id, event: webhookLogs.event, action: webhookLogs.action,
            summary: webhookLogs.summary, detail: webhookLogs.detail, createdAt: webhookLogs.createdAt,
            scriptName: scripts.name,
        }).from(webhookLogs)
            .leftJoin(scripts, eq(scripts.id, webhookLogs.scriptId))
            .orderBy(desc(webhookLogs.createdAt))
            .limit(limit);
    },

    /** 删除所有 webhook 日志（调试用） */
    async deleteAll(): Promise<void> {
        await db.delete(webhookLogs);
    },
};
