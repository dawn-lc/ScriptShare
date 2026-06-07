import { sqliteTable, text, integer, real, index, uniqueIndex, primaryKey, customType } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

/**
 * SQLite 整数时间戳（毫秒）⇔ JS Date 透明映射。
 * 与 PostgreSQL 的 timestamp 列返回 Date 对象的行为一致。
 */
const timestampMs = customType<{ data: Date; driverData: number }>({
    dataType() { return 'integer' },
    fromDriver(value: number): Date { return new Date(value) },
    toDriver(value: Date): number { return value.getTime() },
});

/**
 * SQLite text 存储 JSON ⇔ JS 对象透明映射。
 * 与 PostgreSQL 的 jsonb 列返回对象的行为一致。
 */
const jsonField = customType<{ data: Record<string, unknown>; driverData: string }>({
    dataType() { return 'text' },
    fromDriver(value: string): Record<string, unknown> { return JSON.parse(value) },
    toDriver(value: Record<string, unknown>): string { return JSON.stringify(value) },
});

// ── users ──

export const users = sqliteTable('users', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    username: text('username').notNull().unique(),
    displayName: text('displayName').default(''),
    passwordHash: text('passwordHash').notNull(),
    avatarUrl: text('avatarUrl').default(''),
    role: text('role').notNull().default('user'),
    tokenNonce: text('tokenNonce').notNull().default(''),
    createdAt: timestampMs('createdAt').default(sql`(cast(strftime('%s', 'now') as integer) * 1000)`),
    updatedAt: timestampMs('updatedAt').default(sql`(cast(strftime('%s', 'now') as integer) * 1000)`),
}, (table) => [
    index('idx_users_role').on(table.role),
]);

// ── scripts ──

export const scripts = sqliteTable('scripts', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    name: text('name').notNull(),
    namespace: text('namespace').default(''),
    version: text('version').notNull().default('1.0.0'),
    description: text('description').default(''),
    author: text('author').default(''),
    icon: text('icon').default(''),
    icon64: text('icon64').default(''),
    grant: text('grant').default(''),
    match: text('match').default(''),
    exclude: text('exclude').default(''),
    require: text('require').default(''),
    resource: text('resource').default(''),
    connect: text('connect').default(''),
    code: text('code').notNull(),
    filename: text('filename').default(''),
    userId: integer('userId').references(() => users.id, { onDelete: 'set null' }),
    installs: integer('installs').notNull().default(0),
    updateChecks: integer('updateChecks').notNull().default(0),
    webhookSecret: text('webhookSecret').default(''),
    githubRepo: text('githubRepo').default(''),
    githubPath: text('githubPath').default(''),
    githubBranch: text('githubBranch').default('main'),
    canaryVersion: text('canaryVersion').default(''),
    canaryCode: text('canaryCode').default(''),
    canaryBranch: text('canaryBranch').default('canary'),
    readme: text('readme').default(''),
    supportURL: text('supportURL').default(''),
    i18n: jsonField('i18n').default({}),
    createdAt: timestampMs('createdAt').default(sql`(cast(strftime('%s', 'now') as integer) * 1000)`),
    updatedAt: timestampMs('updatedAt').default(sql`(cast(strftime('%s', 'now') as integer) * 1000)`),
}, (table) => [
    index('idx_scripts_userId').on(table.userId),
    index('idx_scripts_name').on(table.name),
    index('idx_scripts_updatedAt').on(table.updatedAt),
    index('idx_scripts_author').on(table.author),
]);

// ── install_logs ──

export const installLogs = sqliteTable('install_logs', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    scriptId: integer('scriptId').notNull().references(() => scripts.id, { onDelete: 'cascade' }),
    ipHash: text('ipHash'),
    userAgent: text('userAgent'),
    browser: text('browser').default(''),
    os: text('os').default(''),
    device: text('device').default(''),
    installedAt: timestampMs('installedAt').default(sql`(cast(strftime('%s', 'now') as integer) * 1000)`),
}, (table) => [
    index('idx_install_logs_script').on(table.scriptId),
    index('idx_install_logs_date').on(table.installedAt),
]);

// ── update_logs ──

export const updateLogs = sqliteTable('update_logs', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    scriptId: integer('scriptId').notNull().references(() => scripts.id, { onDelete: 'cascade' }),
    oldVersion: text('oldVersion'),
    newVersion: text('newVersion'),
    ipHash: text('ipHash'),
    checkedAt: timestampMs('checkedAt').default(sql`(cast(strftime('%s', 'now') as integer) * 1000)`),
}, (table) => [
    index('idx_update_logs_script').on(table.scriptId),
    index('idx_update_logs_date').on(table.checkedAt),
]);

// ── audit_logs ──

export const auditLogs = sqliteTable('audit_logs', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    action: text('action').notNull(),
    userId: integer('userId'),
    detail: text('detail').notNull(),
    metadata: jsonField('metadata'),
    createdAt: timestampMs('createdAt').default(sql`(cast(strftime('%s', 'now') as integer) * 1000)`),
}, (table) => [
    index('idx_audit_logs_action').on(table.action),
    index('idx_audit_logs_user').on(table.userId),
    index('idx_audit_logs_created').on(table.createdAt),
]);

// ── webhook_logs ──

export const webhookLogs = sqliteTable('webhook_logs', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    scriptId: integer('scriptId').references(() => scripts.id, { onDelete: 'set null' }),
    event: text('event').notNull(),
    action: text('action').notNull().default(''),
    summary: text('summary').default(''),
    detail: text('detail').default(''),
    createdAt: timestampMs('createdAt').default(sql`(cast(strftime('%s', 'now') as integer) * 1000)`),
});

// ── ratings ──

export const ratings = sqliteTable('ratings', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    scriptId: integer('scriptId').notNull().references(() => scripts.id, { onDelete: 'cascade' }),
    userId: integer('userId').notNull().references(() => users.id, { onDelete: 'cascade' }),
    score: integer('score').notNull(), // 1-5
    comment: text('comment').default(''),
    createdAt: timestampMs('createdAt').default(sql`(cast(strftime('%s', 'now') as integer) * 1000)`),
    updatedAt: timestampMs('updatedAt').default(sql`(cast(strftime('%s', 'now') as integer) * 1000)`),
}, (table) => [
    uniqueIndex('idx_ratings_script_user').on(table.scriptId, table.userId),
    index('idx_ratings_script').on(table.scriptId),
]);

// ── cap_challenges (managed by @cap.js/server) ──

export const capChallenges = sqliteTable('cap_challenges', {
    token: text('token').primaryKey(),
    data: text('data').notNull(),
    expires: integer('expires').notNull(),
    createdAt: integer('createdAt'),
});

// ── cap_tokens (managed by @cap.js/server) ──

export const capTokens = sqliteTable('cap_tokens', {
    key: text('key').primaryKey(),
    expires: integer('expires').notNull(),
});

