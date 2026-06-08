/**
 * 用户仓库。
 */
import { eq, count as drizzleCount, desc, count } from 'drizzle-orm';
import { db } from '../index';
import { users, scripts } from '../schema';

// ── 类型从 schema 直接推导 ──
type User = typeof users.$inferSelect;
type NewUser = typeof users.$inferInsert;

// ── 自定义接口 ──
export interface UserUpdateData {
    displayName?: string; passwordHash?: string;
    avatarUrl?: string; role?: string; tokenNonce?: string;
}

export const userRepo = {
    /** 按 ID 查找用户 */
    async findById(id: number, columns?: Partial<Record<keyof User, boolean>>): Promise<User | undefined> {
        if (columns) {
            const fields: Record<string, unknown> = {};
            for (const key in columns) {
                if (columns[key as keyof User]) {
                    fields[key] = users[key as keyof User];
                }
            }
            const [row] = await (db.select as (f: Record<string, unknown>) => ReturnType<typeof db.select>)(fields)
                .from(users).where(eq(users.id, id));
            return row as User | undefined;
        }
        const [row] = await db.select().from(users).where(eq(users.id, id));
        return row;
    },

    /** 按用户名查找用户 */
    async findByUsername(username: string, columns?: Partial<Record<keyof User, boolean>>): Promise<User | undefined> {
        if (columns) {
            const fields: Record<string, unknown> = {};
            for (const key in columns) {
                if (columns[key as keyof User]) {
                    fields[key] = users[key as keyof User];
                }
            }
            const [row] = await (db.select as (f: Record<string, unknown>) => ReturnType<typeof db.select>)(fields)
                .from(users).where(eq(users.username, username));
            return row as User | undefined;
        }
        const [row] = await db.select().from(users).where(eq(users.username, username));
        return row;
    },

    /** 仅查询用户 ID */
    async findIdByUsername(username: string): Promise<{ id: number } | undefined> {
        const [row] = await db.select({ id: users.id }).from(users).where(eq(users.username, username));
        return row;
    },

    /** 查询密码哈希 */
    async findPasswordHashById(id: number): Promise<{ passwordHash: string } | undefined> {
        const [row] = await db.select({ passwordHash: users.passwordHash }).from(users).where(eq(users.id, id));
        return row;
    },

    /** 创建用户 */
    async create(data: NewUser): Promise<User> {
        const [inserted] = await db.insert(users).values(data).returning();
        return inserted;
    },

    /** 更新用户 */
    async update(id: number, data: Partial<UserUpdateData>): Promise<void> {
        await db.update(users).set(data).where(eq(users.id, id));
    },

    /** 更新用户并返回更新后的行 */
    async updateAndReturn(id: number, data: Partial<UserUpdateData>, columns?: Partial<Record<keyof User, boolean>>): Promise<User | undefined> {
        await db.update(users).set(data).where(eq(users.id, id));
        if (columns) {
            const fields: Record<string, unknown> = {};
            for (const key in columns) {
                if (columns[key as keyof User]) {
                    fields[key] = users[key as keyof User];
                }
            }
            const [row] = await (db.select as (f: Record<string, unknown>) => ReturnType<typeof db.select>)(fields)
                .from(users).where(eq(users.id, id));
            return row as User | undefined;
        }
        const [row] = await db.select().from(users).where(eq(users.id, id));
        return row;
    },

    /** 用户总数 */
    async count(): Promise<number> {
        const [row] = await db.select({ count: drizzleCount() }).from(users);
        return row?.count ?? 0;
    },

    /** 所有用户及脚本数 */
    async findAllWithScriptCount(): Promise<{ id: number; username: string; displayName: string | null; role: string; avatarUrl: string | null; createdAt: Date | null; updatedAt: Date | null; scriptCount: number }[]> {
        return db.select({
            id: users.id, username: users.username, displayName: users.displayName,
            role: users.role, avatarUrl: users.avatarUrl,
            createdAt: users.createdAt, updatedAt: users.updatedAt,
            scriptCount: count(scripts.id),
        }).from(users)
            .leftJoin(scripts, eq(scripts.userId, users.id))
            .orderBy(desc(users.createdAt))
            .groupBy(users.id);
    },

    /** 每个用户的脚本数排行 */
    async getScriptsPerUser(): Promise<{ username: string; displayName: string | null; scriptCount: number }[]> {
        return db.select({
            username: users.username,
            displayName: users.displayName,
            scriptCount: count(scripts.id),
        }).from(users)
            .leftJoin(scripts, eq(scripts.userId, users.id))
            .groupBy(users.id)
            .orderBy(desc(count(scripts.id)));
    },

    /** 删除所有用户（调试用） */
    async deleteAll(): Promise<void> {
        await db.delete(users);
    },
};
