/**
 * 仓库层统一导出。
 * 使用: `import { userRepo, scriptRepo, ... } from '../db/repos'`
 */

export { userRepo } from './user';
export { scriptRepo } from './script';
export { logRepo } from './log';
export { auditRepo } from './audit';
export { webhookRepo } from './webhook';
export { captchaRepo } from './captcha';
export { ratingRepo } from './rating';
