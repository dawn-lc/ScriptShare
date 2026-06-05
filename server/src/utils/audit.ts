/**
 * Audit logging utility.
 * Records important actions (login, register, script CRUD, admin actions)
 * into the audit_logs table for review in the admin panel.
 */
import { db } from '../db';
import { auditLogs } from '../db';

export type AuditAction =
    | 'user.register'
    | 'user.login'
    | 'script.create'
    | 'script.update'
    | 'script.delete'
    | 'script.install'
    | 'admin.access'
    | 'admin.action'
    | 'webhook.received'
    | 'captcha.solved'
    | 'user.update_profile'
    | 'user.change_password';

/**
 * Record an audit log entry.
 *
 * @param action   - The action type (e.g. 'user.register', 'script.create')
 * @param userId   - The user who performed the action (null for anonymous)
 * @param detail   - A human-readable summary of what happened
 * @param metadata - Optional JSON-serializable object with extra context
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
            metadata: metadata ? JSON.stringify(metadata) : null,
        }).run();
    } catch (err) {
        console.error('[audit] Failed to write audit log:', err);
    }
}
