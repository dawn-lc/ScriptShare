/**
 * 脚本仓库。
 */
import { eq, count as drizzleCount, and, like, desc, sql, isNull } from 'drizzle-orm';
import { db } from '../index';
import { scripts, users, ratings } from '../schema';
import { getCache, setCache, invalidateCache } from '../../utils/cache';

const notDeleted = isNull(scripts.deletedAt);

// ── 类型从 schema 直接推导 ──
type Script = typeof scripts.$inferSelect;
export type NewScript = typeof scripts.$inferInsert;

// ── 自定义接口 ──
export interface ScriptUpdateData {
    name?: string; namespace?: string; version?: string; canaryVersion?: string;
    description?: string; author?: string; icon?: string; icon64?: string;
    supportURL?: string;
    grant?: string[]; match?: string[]; exclude?: string[];
    require?: string[]; resource?: string[]; connect?: string[];
    code?: string; canaryCode?: string; readme?: string; filename?: string;
    userId?: number | null; installs?: number; updateChecks?: number;
    webhookSecret?: string; githubRepo?: string; githubPath?: string;
    i18n?: Record<string, unknown>;
}

export interface ScriptListItem {
    id: number; name: string; description: string | null;
    version: string; author: string | null; installs: number;
    updateChecks: number; userId: number | null;
    authorName: string | null; createdAt: Date | null; updatedAt: Date | null;
}

export interface RatingStats {
    avg: number | null; count: number;
}

export interface ScriptOverview {
    id: number; name: string; installs: number;
    updateChecks: number; authorName: string | null; createdAt: Date | null;
}

interface PaginatedResult<T> {
    items: T[]; total: number;
}

export const scriptRepo = {
    /** 按 ID 查找脚本 */
    async findById(id: number, includeDeleted = false): Promise<Script | undefined> {
        const condition = includeDeleted ? eq(scripts.id, id) : and(notDeleted, eq(scripts.id, id));
        const [row] = await db.select().from(scripts).where(condition);
        return row;
    },

    /** 按 ID 查找脚本（指定列） */
    async findByIdColumns(id: number, columns: Partial<Record<keyof Script, boolean>>, includeDeleted = false): Promise<Partial<Script> | undefined> {
        const fields: Record<string, unknown> = {};
        for (const key in columns) {
            if (columns[key as keyof Script]) {
                fields[key] = scripts[key as keyof Script];
            }
        }
        const condition = includeDeleted ? eq(scripts.id, id) : and(notDeleted, eq(scripts.id, id));
        const [row] = await (db.select as (f: Record<string, unknown>) => ReturnType<typeof db.select>)(fields)
            .from(scripts).where(condition);
        return row as Partial<Script> | undefined;
    },

    /** 按文件名查找脚本 */
    async findByFilename(filename: string): Promise<Script | undefined> {
        const [row] = await db.select().from(scripts).where(and(notDeleted, eq(scripts.filename, filename)));
        return row;
    },

    /** 创建脚本 */
    async create(data: NewScript): Promise<Script> {
        const [inserted] = await db.insert(scripts).values(data).returning();
        invalidateCache('script:');
        return inserted;
    },

    /** 更新脚本 */
    async update(id: number, data: Partial<ScriptUpdateData>): Promise<void> {
        await db.update(scripts).set(data).where(eq(scripts.id, id));
        invalidateCache('script:');
    },

    /** 更新脚本并返回更新后的行 */
    async updateAndReturn(id: number, data: Partial<ScriptUpdateData>, columns?: Partial<Record<keyof Script, boolean>>): Promise<Partial<Script> | undefined> {
        await db.update(scripts).set(data).where(eq(scripts.id, id));
        invalidateCache('script:');
        if (columns) {
            const fields: Record<string, unknown> = {};
            for (const key in columns) {
                if (columns[key as keyof Script]) {
                    fields[key] = scripts[key as keyof Script];
                }
            }
            const [row] = await (db.select as (f: Record<string, unknown>) => ReturnType<typeof db.select>)(fields)
                .from(scripts).where(and(notDeleted, eq(scripts.id, id)));
            return row as Partial<Script> | undefined;
        }
        const [row] = await db.select().from(scripts).where(and(notDeleted, eq(scripts.id, id)));
        return row;
    },

    /** 软删除脚本 */
    async delete(id: number): Promise<void> {
        await db.update(scripts).set({ deletedAt: new Date() }).where(eq(scripts.id, id));
        invalidateCache('script:');
    },

    /** 永久删除（调试用） */
    async hardDelete(id: number): Promise<void> {
        await db.delete(scripts).where(eq(scripts.id, id));
        invalidateCache('script:');
    },

    /** 增加安装计数 */
    async incrementInstalls(id: number): Promise<void> {
        await db.update(scripts).set({ installs: sql`${scripts.installs} + 1` }).where(and(notDeleted, eq(scripts.id, id)));
        invalidateCache('script:');
    },

    /** 增加更新检查计数 */
    async incrementUpdateChecks(id: number): Promise<void> {
        await db.update(scripts).set({ updateChecks: sql`${scripts.updateChecks} + 1` }).where(and(notDeleted, eq(scripts.id, id)));
        invalidateCache('script:');
    },

    /** 设置 webhook 密钥 */
    async setWebhookSecret(id: number, secret: string): Promise<void> {
        await db.update(scripts).set({ webhookSecret: secret }).where(and(notDeleted, eq(scripts.id, id)));
        invalidateCache('script:');
    },

    /** 搜索脚本（分页） */
    async search(options: {
        keyword?: string;
        sortBy?: 'updatedAt' | 'installs' | 'createdAt';
        sortOrder?: 'asc' | 'desc';
        limit: number;
        offset: number;
    }): Promise<PaginatedResult<ScriptListItem>> {
        const { keyword, sortBy = 'updatedAt', sortOrder = 'desc', limit, offset } = options;

        const searchFilter = keyword
            ? and(like(scripts.name, `%${keyword}%`), eq(scripts.userId, scripts.userId))
            : undefined;

        const [{ count: total }] = await (keyword
            ? db.select({ count: drizzleCount() }).from(scripts).where(searchFilter)
            : db.select({ count: drizzleCount() }).from(scripts));

        const orderColumn = sortBy === 'installs' ? scripts.installs
            : sortBy === 'createdAt' ? scripts.createdAt
                : scripts.updatedAt;
        const order = sortOrder === 'asc' ? orderColumn : desc(orderColumn);

        const fields = {
            id: scripts.id,
            name: scripts.name,
            description: scripts.description,
            version: scripts.version,
            author: scripts.author,
            installs: scripts.installs,
            updateChecks: scripts.updateChecks,
            userId: scripts.userId,
            authorName: users.displayName,
            createdAt: scripts.createdAt,
            updatedAt: scripts.updatedAt,
        };

        const items = await (keyword
            ? db.select(fields).from(scripts).where(and(notDeleted, searchFilter)).leftJoin(users, eq(scripts.userId, users.id)).orderBy(order).limit(limit).offset(offset)
            : db.select(fields).from(scripts).where(notDeleted).leftJoin(users, eq(scripts.userId, users.id)).orderBy(order).limit(limit).offset(offset));

        return { items, total };
    },

    /** 获取最热安装脚本（Top N） */
    async getTopInstalled(limit: number): Promise<ScriptOverview[]> {
        return db.select({
            id: scripts.id,
            name: scripts.name,
            installs: scripts.installs,
            updateChecks: scripts.updateChecks,
            authorName: users.displayName,
            createdAt: scripts.createdAt,
        }).from(scripts).where(notDeleted).leftJoin(users, eq(scripts.userId, users.id))
            .orderBy(desc(scripts.installs)).limit(limit);
    },

    /** 获取最热更新检查脚本（Top N） */
    async getTopChecked(limit: number): Promise<ScriptOverview[]> {
        return db.select({
            id: scripts.id,
            name: scripts.name,
            installs: scripts.installs,
            updateChecks: scripts.updateChecks,
            authorName: users.displayName,
            createdAt: scripts.createdAt,
        }).from(scripts).where(notDeleted).leftJoin(users, eq(scripts.userId, users.id))
            .orderBy(desc(scripts.updateChecks)).limit(limit);
    },

    /** 获取总更新检查数 */
    async getTotalUpdateChecks(): Promise<number> {
        const [row] = await db.select({ total: sql<number>`COALESCE(SUM(${scripts.updateChecks}), 0)` }).from(scripts).where(notDeleted);
        return row?.total ?? 0;
    },

    /** 最近脚本（含所有者名） */
    async findRecentWithOwner(limit: number): Promise<{ id: number; name: string; version: string; installs: number; createdAt: Date | null; owner: string | null }[]> {
        return db.select({
            id: scripts.id, name: scripts.name, version: scripts.version,
            installs: scripts.installs, createdAt: scripts.createdAt,
            owner: users.username,
        }).from(scripts).where(notDeleted)
            .leftJoin(users, eq(users.id, scripts.userId))
            .orderBy(desc(scripts.createdAt))
            .limit(limit);
    },

    /** 获取评分统计 */
    async getRatingStats(scriptId: number): Promise<RatingStats> {
        const [stats] = await db.select({
            avg: sql<number>`ROUND(AVG(${ratings.score}), 1)`,
            count: drizzleCount(),
        }).from(ratings).where(eq(ratings.scriptId, scriptId));
        return { avg: stats?.avg ?? null, count: stats?.count ?? 0 };
    },

    /** 获取用户的所有脚本 */
    async findByUserId(userId: number): Promise<Script[]> {
        return db.select().from(scripts).where(and(notDeleted, eq(scripts.userId, userId)));
    },

    /** 脚本总数 */
    async count(): Promise<number> {
        const cacheKey = 'script:count';
        const cached = getCache<number>(cacheKey);
        if (cached !== undefined) return cached;
        const [row] = await db.select({ count: drizzleCount() }).from(scripts).where(notDeleted);
        const result = row?.count ?? 0;
        setCache(cacheKey, result, 30_000);
        return result;
    },

    /** 统计用户的脚本数 */
    async countByUserId(userId: number): Promise<number> {
        const [row] = await db.select({ count: drizzleCount() }).from(scripts)
            .where(and(notDeleted, eq(scripts.userId, userId)));
        return row?.count ?? 0;
    },

    /** 获取所有脚本 ID */
    async findAllIds(): Promise<{ id: number }[]> {
        return db.select({ id: scripts.id }).from(scripts).where(notDeleted);
    },

    /** 删除所有脚本（调试用） */
    async deleteAll(): Promise<void> {
        await db.delete(scripts);
    },
};
