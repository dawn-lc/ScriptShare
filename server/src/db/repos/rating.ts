/**
 * 评分仓库。
 */
import { eq, and, count as drizzleCount, avg, inArray } from 'drizzle-orm';
import { db } from '../index';
import { ratings } from '../schema';

// ── 类型从 schema 直接推导 ──
type Rating = typeof ratings.$inferSelect;
type NewRating = typeof ratings.$inferInsert;

// ── 自定义接口 ──
export interface RatingWithScript {
    id: number; scriptId: number; score: number;
    comment: string | null; createdAt: Date | null; scriptName: string | null;
}

export const ratingRepo = {
    /** 按 ID 查找评分 */
    async findById(id: number): Promise<Rating | undefined> {
        const [row] = await db.select().from(ratings).where(eq(ratings.id, id));
        return row;
    },

    /** 查找用户对某脚本的评分 */
    async findByUserAndScript(userId: number, scriptId: number): Promise<Rating | undefined> {
        const [row] = await db.select().from(ratings)
            .where(and(eq(ratings.userId, userId), eq(ratings.scriptId, scriptId)));
        return row;
    },

    /** 创建评分 */
    async create(data: NewRating): Promise<void> {
        await db.insert(ratings).values(data);
    },

    /** 更新评分 */
    async update(id: number, data: Partial<NewRating>): Promise<void> {
        await db.update(ratings).set(data).where(eq(ratings.id, id));
    },

    /** 创建或更新评分（upsert） */
    async upsert(userId: number, scriptId: number, data: { score: number; comment?: string }): Promise<void> {
        const existing = await this.findByUserAndScript(userId, scriptId);
        if (existing) {
            await this.update(existing.id, data);
        } else {
            await this.create({ userId, scriptId, score: data.score, comment: data.comment ?? '' });
        }
    },

    /** 获取脚本的所有评分 */
    async findByScriptId(scriptId: number, limit?: number, offset?: number): Promise<Rating[]> {
        const base = db.select().from(ratings).where(eq(ratings.scriptId, scriptId));
        const withLimit = limit ? base.limit(limit) : base;
        return offset ? withLimit.offset(offset) : withLimit;
    },

    /** 批量获取脚本评分汇总 */
    async getAverageByScriptIds(scriptIds: number[]): Promise<{ scriptId: number; average: string | null; count: number }[]> {
        if (scriptIds.length === 0) return [];
        return db.select({
            scriptId: ratings.scriptId,
            average: avg(ratings.score),
            count: drizzleCount(),
        }).from(ratings)
            .where(inArray(ratings.scriptId, scriptIds))
            .groupBy(ratings.scriptId);
    },

    /** 评分总数 */
    async count(): Promise<number> {
        const [row] = await db.select({ count: drizzleCount() }).from(ratings);
        return row?.count ?? 0;
    },

    /** 删除所有评分（调试用） */
    async deleteAll(): Promise<void> {
        await db.delete(ratings);
    },
};
