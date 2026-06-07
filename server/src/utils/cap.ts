/**
 * Cap CAPTCHA 集成。
 * 使用 @cap.js/server 生成和验证挑战。
 * 存储由 Drizzle ORM 的 SQLite 支持。
 * 表由 database.ts 的 initDatabase() 创建。
 */
import Cap from '@cap.js/server';
import { db } from '../db';
import { capChallenges, capTokens } from '../db';
import { eq, gt, lte, and } from 'drizzle-orm';

const cap = new Cap({
    storage: {
        challenges: {
            store: async (token: string, data: Record<string, unknown>) => {
                db.insert(capChallenges).values({
                    token,
                    data: JSON.stringify(data),
                    expires: data.expires,
                }).onConflictDoUpdate({
                    target: capChallenges.token,
                    set: { data: JSON.stringify(data), expires: data.expires },
                }).run();
            },
            read: async (token: string) => {
                const row = db.select().from(capChallenges)
                    .where(and(
                        eq(capChallenges.token, token),
                        gt(capChallenges.expires, Date.now()),
                    )).get();
                return row ? { challenge: JSON.parse(row.data), expires: Number(row.expires) } : null;
            },
            delete: async (token: string) => {
                db.delete(capChallenges).where(eq(capChallenges.token, token)).run();
            },
            deleteExpired: async () => {
                db.delete(capChallenges).where(lte(capChallenges.expires, Date.now())).run();
            },
        },
        tokens: {
            store: async (key: string, expires: number) => {
                db.insert(capTokens).values({ key, expires }).onConflictDoUpdate({
                    target: capTokens.key,
                    set: { expires },
                }).run();
            },
            get: async (key: string) => {
                const row = db.select({ expires: capTokens.expires }).from(capTokens)
                    .where(and(
                        eq(capTokens.key, key),
                        gt(capTokens.expires, Date.now()),
                    )).get();
                return row ? Number(row.expires) : null;
            },
            delete: async (key: string) => {
                db.delete(capTokens).where(eq(capTokens.key, key)).run();
            },
            deleteExpired: async () => {
                db.delete(capTokens).where(lte(capTokens.expires, Date.now())).run();
            },
        },
    },
});

export default cap;
