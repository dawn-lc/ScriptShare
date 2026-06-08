/**
 * 审计日志仓库。
 */
import { eq, desc, count as drizzleCount } from 'drizzle-orm';
import { db } from '../index';
import { auditLogs, users } from '../schema';

// ── 类型从 schema 直接推导 ──
type AuditLog = typeof auditLogs.$inferSelect;
type NewAuditLog = typeof auditLogs.$inferInsert;


export const auditRepo = {
    /** 写入审计日志 */
    async create(data: NewAuditLog): Promise<void> {
        await db.insert(auditLogs).values(data);
    },

    /** 按操作类型查询 */
    async findByAction(action: string, limit?: number): Promise<AuditLog[]> {
        const base = db.select().from(auditLogs).where(eq(auditLogs.action, action)).orderBy(desc(auditLogs.createdAt));
        return limit ? base.limit(limit) : base;
    },

    /** 按用户查询 */
    async findByUserId(userId: number, limit?: number): Promise<AuditLog[]> {
        const base = db.select().from(auditLogs).where(eq(auditLogs.userId, userId)).orderBy(desc(auditLogs.createdAt));
        return limit ? base.limit(limit) : base;
    },

    /** 查询最近的审计日志 */
    async findRecent(limit: number, offset?: number): Promise<AuditLog[]> {
        const base = db.select().from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(limit);
        return offset ? base.offset(offset) : base;
    },

    /** 审计日志总数 */
    async count(): Promise<number> {
        const [row] = await db.select({ count: drizzleCount() }).from(auditLogs);
        return row?.count ?? 0;
    },

    /** 最近的审计日志（含用户名，分页） */
    async findRecentWithUser(limit: number, offset: number): Promise<{ id: number; action: string; userId: number | null; detail: string | null; metadata: unknown; createdAt: Date | null; userName: string | null }[]> {
        return db.select({
            id: auditLogs.id, action: auditLogs.action, userId: auditLogs.userId,
            detail: auditLogs.detail, metadata: auditLogs.metadata, createdAt: auditLogs.createdAt,
            userName: users.username,
        }).from(auditLogs)
            .leftJoin(users, eq(users.id, auditLogs.userId))
            .orderBy(desc(auditLogs.createdAt))
            .limit(limit)
            .offset(offset);
    },

    /** 删除所有审计日志（调试用） */
    async deleteAll(): Promise<void> {
        await db.delete(auditLogs);
    },
};
