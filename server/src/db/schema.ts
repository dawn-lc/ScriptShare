/**
 * Schema 重新导出——在运行时选择正确的方言实现。
 * SQLite 用于开发，PostgreSQL 用于生产。
 * 通过环境变量 DB_DIALECT=postgresql 切换。
 */

// eslint-disable-next-line @typescript-eslint/no-var-requires
const schema = require('../config').DB_DIALECT === 'postgresql'
    ? require('./schema-pg')
    : require('./schema-sqlite');

export const {
    users, scripts, installLogs, updateLogs, auditLogs,
    webhookLogs, capChallenges, capTokens, ratings,
} = schema;
