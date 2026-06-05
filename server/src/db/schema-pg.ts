import { pgTable, text, integer, real, serial, timestamp, index, uniqueIndex, primaryKey } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

// ── users ──

export const users = pgTable('users', {
    id: serial('id').primaryKey(),
    username: text('username').notNull().unique(),
    displayName: text('displayName').default(''),
    passwordHash: text('passwordHash').notNull(),
    avatarUrl: text('avatarUrl').default(''),
    role: text('role').notNull().default('user'),
    createdAt: timestamp('createdAt', { withTimezone: true }).default(sql`NOW()`),
    updatedAt: timestamp('updatedAt', { withTimezone: true }).default(sql`NOW()`),
    envInfo: text('envInfo').default('{}'),
}, (table) => [
    index('idx_users_role').on(table.role),
]);

// ── scripts ──

export const scripts = pgTable('scripts', {
    id: serial('id').primaryKey(),
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
    i18n: text('i18n').default('{}'),
    createdAt: timestamp('createdAt', { withTimezone: true }).default(sql`NOW()`),
    updatedAt: timestamp('updatedAt', { withTimezone: true }).default(sql`NOW()`),
}, (table) => [
    index('idx_scripts_userId').on(table.userId),
    index('idx_scripts_name').on(table.name),
    index('idx_scripts_updatedAt').on(table.updatedAt),
    index('idx_scripts_author').on(table.author),
]);

// ── install_logs ──

export const installLogs = pgTable('install_logs', {
    id: serial('id').primaryKey(),
    scriptId: integer('scriptId').notNull().references(() => scripts.id, { onDelete: 'cascade' }),
    ipHash: text('ipHash'),
    userAgent: text('userAgent'),
    browser: text('browser').default(''),
    os: text('os').default(''),
    device: text('device').default(''),
    installedAt: timestamp('installedAt', { withTimezone: true }).default(sql`NOW()`),
}, (table) => [
    index('idx_install_logs_script').on(table.scriptId),
    index('idx_install_logs_date').on(table.installedAt),
]);

// ── update_logs ──

export const updateLogs = pgTable('update_logs', {
    id: serial('id').primaryKey(),
    scriptId: integer('scriptId').notNull().references(() => scripts.id, { onDelete: 'cascade' }),
    oldVersion: text('oldVersion'),
    newVersion: text('newVersion'),
    ipHash: text('ipHash'),
    checkedAt: timestamp('checkedAt', { withTimezone: true }).default(sql`NOW()`),
}, (table) => [
    index('idx_update_logs_script').on(table.scriptId),
    index('idx_update_logs_date').on(table.checkedAt),
]);

// ── audit_logs ──

export const auditLogs = pgTable('audit_logs', {
    id: serial('id').primaryKey(),
    action: text('action').notNull(),
    userId: integer('userId'),
    detail: text('detail').notNull(),
    metadata: text('metadata').default(''),
    createdAt: timestamp('createdAt', { withTimezone: true }).default(sql`NOW()`),
}, (table) => [
    index('idx_audit_logs_action').on(table.action),
    index('idx_audit_logs_user').on(table.userId),
    index('idx_audit_logs_created').on(table.createdAt),
]);

// ── visitor_logs ──

export const visitorLogs = pgTable('visitor_logs', {
    id: serial('id').primaryKey(),
    visitorId: text('visitorId').notNull(),
    action: text('action').notNull(),
    envScore: real('envScore'),
    fpConfidence: real('fpConfidence'),
    ipHash: text('ipHash').default(''),
    metadata: text('metadata').default(''),
    createdAt: timestamp('createdAt', { withTimezone: true }).default(sql`NOW()`),
}, (table) => [
    index('idx_visitor_logs_vid').on(table.visitorId),
    index('idx_visitor_logs_vid_act').on(table.visitorId, table.action),
    index('idx_visitor_logs_time').on(table.createdAt),
]);

// ── webhook_logs ──

export const webhookLogs = pgTable('webhook_logs', {
    id: serial('id').primaryKey(),
    scriptId: integer('scriptId').references(() => scripts.id, { onDelete: 'set null' }),
    event: text('event').notNull(),
    action: text('action').notNull().default(''),
    summary: text('summary').default(''),
    detail: text('detail').default(''),
    createdAt: timestamp('createdAt', { withTimezone: true }).default(sql`NOW()`),
});

// ── ratings ──

export const ratings = pgTable('ratings', {
    id: serial('id').primaryKey(),
    scriptId: integer('scriptId').notNull().references(() => scripts.id, { onDelete: 'cascade' }),
    userId: integer('userId').notNull().references(() => users.id, { onDelete: 'cascade' }),
    score: integer('score').notNull(), // 1-5
    comment: text('comment').default(''),
    createdAt: timestamp('createdAt', { withTimezone: true }).default(sql`NOW()`),
    updatedAt: timestamp('updatedAt', { withTimezone: true }).default(sql`NOW()`),
}, (table) => [
    uniqueIndex('idx_ratings_script_user').on(table.scriptId, table.userId),
    index('idx_ratings_script').on(table.scriptId),
]);

// ── cap_challenges (managed by @cap.js/server) ──

export const capChallenges = pgTable('cap_challenges', {
    token: text('token').primaryKey(),
    data: text('data').notNull(),
    expires: integer('expires').notNull(),
    visitorId: text('visitorId').default(''),
});

// ── cap_tokens (managed by @cap.js/server) ──

export const capTokens = pgTable('cap_tokens', {
    key: text('key').primaryKey(),
    expires: integer('expires').notNull(),
});
