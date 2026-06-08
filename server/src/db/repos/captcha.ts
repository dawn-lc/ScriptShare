/**
 * 验证码仓库。
 */
import { lte, eq, gt, and, count as drizzleCount } from 'drizzle-orm';
import { db } from '../index';
import { captchaTokens, captchaChallenges } from '../schema';

// ── 类型从 schema 直接推导 ──
type NewCaptchaToken = typeof captchaTokens.$inferInsert;


export const captchaRepo = {
    // ── Captcha Tokens ──

    /** 创建验证码 token */
    async createToken(data: NewCaptchaToken): Promise<void> {
        await db.insert(captchaTokens).values(data);
    },

    /** 按 key 删除未过期的 token */
    async redeemToken(key: string): Promise<boolean> {
        const result = await db.delete(captchaTokens)
            .where(and(eq(captchaTokens.key, key), gt(captchaTokens.expires, Date.now())));
        return (result.rowCount ?? 0) > 0;
    },

    /** 清理过期 tokens */
    async cleanupExpiredTokens(): Promise<void> {
        await db.delete(captchaTokens).where(lte(captchaTokens.expires, Date.now()));
    },

    /** Token 总数 */
    async countTokens(): Promise<number> {
        const [row] = await db.select({ count: drizzleCount() }).from(captchaTokens);
        return row?.count ?? 0;
    },

    /** 活跃（未过期）Token 数 */
    async countActiveTokens(): Promise<number> {
        const [row] = await db.select({ count: drizzleCount() }).from(captchaTokens)
            .where(gt(captchaTokens.expires, Date.now()));
        return row?.count ?? 0;
    },

    /** 过期 Token 数 */
    async countExpiredTokens(): Promise<number> {
        const [row] = await db.select({ count: drizzleCount() }).from(captchaTokens)
            .where(lte(captchaTokens.expires, Date.now()));
        return row?.count ?? 0;
    },

    /** 删除所有 tokens（调试用） */
    async deleteAllTokens(): Promise<void> {
        await db.delete(captchaTokens);
    },

    // ── Captcha Challenges ──

    /** 清理过期 challenges */
    async cleanupExpiredChallenges(): Promise<void> {
        await db.delete(captchaChallenges).where(lte(captchaChallenges.expires, Date.now()));
    },

    /** 活跃（未过期）Challenge 数 */
    async countActiveChallenges(): Promise<number> {
        const [row] = await db.select({ count: drizzleCount() }).from(captchaChallenges)
            .where(gt(captchaChallenges.expires, Date.now()));
        return row?.count ?? 0;
    },

    /** 过期 Challenge 数 */
    async countExpiredChallenges(): Promise<number> {
        const [row] = await db.select({ count: drizzleCount() }).from(captchaChallenges)
            .where(lte(captchaChallenges.expires, Date.now()));
        return row?.count ?? 0;
    },

    /** 删除所有 challenges（调试用） */
    async deleteAllChallenges(): Promise<void> {
        await db.delete(captchaChallenges);
    },
};
