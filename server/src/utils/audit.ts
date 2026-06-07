/**
 * 审计日志工具。
 * 记录重要操作（登录、注册、脚本 CRUD、管理员操作）
 * 到 audit_logs 表中，供管理面板审核。
 */
import { db } from '../db';
import { auditLogs } from '../db';

export type AuditAction =
    | 'user.register'
    | 'user.login'
    | 'user.logout'
    | 'user.update_profile'
    | 'user.change_password'
    | 'script.create'
    | 'script.update'
    | 'script.delete'
    | 'script.install'
    | 'script.check_update'
    | 'script.rate'
    | 'script.webhook_secret'
    | 'script.github_config'
    | 'admin.access'
    | 'admin.action'
    | 'webhook.received'
    | 'captcha.solved'
    | 'debug.login_as'
    | 'debug.create_user'
    | 'debug.reset'
    | 'debug.seed'
    | 'debug.cleanup';

/**
 * 记录审计日志条目。
 *
 * @param action   - 操作类型（如 'user.register', 'script.create'）
 * @param userId   - 执行操作的用户（匿名用户为 null）
 * @param detail   - 人类可读的操作摘要
 * @param metadata - 可选的 JSON 序列化对象，包含额外上下文
 */
export function audit(
    action: AuditAction,
    userId: number | null,
    detail: string,
    metadata?: Record<string, unknown>,
): void {
    try {
        db.insert(auditLogs).values({
            action,
            userId,
            detail,
            metadata: metadata || null,
        }).run();
    } catch (err: unknown) {
        console.error('[audit] Failed to write audit log:', err);
    }
}
