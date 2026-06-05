import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { db } from '../db';
import { webhookLogs, scripts } from '../db';
import { eq } from 'drizzle-orm';

const router = Router();

/**
 * Verify X-Hub-Signature-256 using the script's webhook_secret.
 * This is the standard GitHub webhook authentication method.
 */
function verifySignature(payload: string, signature: string | undefined, secret: string): boolean {
    if (!secret || !signature) return false;

    const sig = signature.replace(/^sha256=/, '');
    const expected = crypto.createHmac('sha256', secret).update(payload, 'utf-8').digest('hex');

    const sigBuf = Buffer.from(sig);
    const expBuf = Buffer.from(expected);
    if (sigBuf.length !== expBuf.length) return false;
    return crypto.timingSafeEqual(sigBuf, expBuf);
}

/**
 * Log webhook event to database for auditing
 */
function logEvent(scriptId: number | null, event: string, action: string, summary: string, detail: string): void {
    try {
        db.insert(webhookLogs).values({
            scriptId,
            event,
            action,
            summary,
            detail,
        }).run();
    } catch {
        // Table might not exist yet — ignore
    }
}

// Ensure the webhook_logs table exists
function ensureTable(): void {
    // webhook_logs table is created by database.ts initDatabase()

}
ensureTable();

// ── Per-script webhook endpoint ──
// Only processes release events. The script file is fetched from the
// release's assets (attachments), not from raw.githubusercontent.com.
// Pre-releases → canary channel, full releases → stable channel.

router.post('/scripts/:id', (req: Request, res: Response) => {
    const scriptId = parseInt(req.params.id as string);
    const signature = req.headers['x-hub-signature-256'] as string | undefined;
    const githubEvent = (req.headers['x-github-event'] as string) || 'unknown';
    const rawBody = (req as any).rawBody as string | undefined;

    if (isNaN(scriptId)) {
        res.status(400).json({ error: '无效的脚本 ID' });
        return;
    }

    const script = db.select({
        id: scripts.id, name: scripts.name, webhookSecret: scripts.webhookSecret,
        githubRepo: scripts.githubRepo, githubPath: scripts.githubPath, version: scripts.version,
    }).from(scripts).where(eq(scripts.id, scriptId)).get() as any;

    if (!script) {
        logEvent(null, 'webhook', 'not_found', `脚本 #${scriptId} 不存在`, '');
        res.status(404).json({ error: '脚本不存在' });
        return;
    }

    // Verify HMAC-SHA256 signature using the script's secret
    if (!script.webhookSecret) {
        logEvent(scriptId, 'webhook', 'no_secret', '脚本未配置 webhook 密钥', '');
        res.status(403).json({ error: '请先在脚本详情页生成 Webhook Secret' });
        return;
    }

    if (!signature) {
        logEvent(scriptId, 'webhook', 'no_signature', '缺少 X-Hub-Signature-256 头', '');
        res.status(401).json({ error: '缺少签名头，请在 GitHub Webhook 配置中填写 Secret' });
        return;
    }

    if (!rawBody || !verifySignature(rawBody, signature, script.webhookSecret)) {
        logEvent(scriptId, 'webhook', 'sig_mismatch', 'HMAC 签名验证失败', '');
        res.status(403).json({ error: '签名验证失败，请检查 GitHub Webhook 中配置的 Secret 是否一致' });
        return;
    }

    // Accept ping for connectivity test
    if (githubEvent === 'ping') {
        logEvent(scriptId, 'ping', 'ok', '连接测试成功', '');
        res.json({ message: 'pong' });
        return;
    }

    // Only handle release events
    if (githubEvent !== 'release') {
        logEvent(scriptId, 'ignored', 'unsupported_event', `仅处理 release 事件，忽略 ${githubEvent}`, '');
        res.status(200).json({ message: `忽略 ${githubEvent} 事件，仅处理 release` });
        return;
    }

    res.status(202).json({ message: 'webhook 已接收' });

    // Process release asynchronously
    setImmediate(async () => {
        try {
            await handleReleaseEvent(script, req.body);
        } catch (err: any) {
            console.error(`[webhook] 脚本 #${scriptId} 处理失败:`, err.message);
        }
    });
});

/**
 * Handle release event.
 * - Verifies repository (if github_repo configured)
 * - Uses release.prerelease boolean to determine channel
 * - Finds matching asset by github_path (or first .user.js asset)
 * - Downloads script content from asset.browser_download_url
 */
async function handleReleaseEvent(script: any, payload: any): Promise<void> {
    const action = payload.action || 'published';
    const release = payload.release || {};
    const repo = payload.repository?.full_name || '';
    const sender = payload.sender?.login || 'unknown';
    const tagName = release.tag_name || '';
    const isPreRelease = !!release.prerelease;
    const releaseName = release.name || tagName;

    // Only process published releases
    if (action !== 'published') {
        logEvent(script.id, 'release', 'ignored', `跳过 action=${action}，仅处理 published`, '');
        return;
    }

    // Verify repository
    if (script.githubRepo && repo && script.githubRepo !== repo) {
        logEvent(script.id, 'release', 'repo_mismatch',
            `仓库 "${repo}" 不匹配配置的 "${script.githubRepo}"`, '');
        return;
    }

    // Find the asset (attachment) containing the script
    const assets: any[] = release.assets || [];
    if (assets.length === 0) {
        logEvent(script.id, 'release', 'no_assets', 'Release 没有附件，请上传 .user.js 文件作为附件', '');
        return;
    }

    // Filter to .user.js assets
    const scriptAssets = assets.filter((a: any) => a.name && a.name.endsWith('.user.js'));
    if (scriptAssets.length === 0) {
        logEvent(script.id, 'release', 'no_script_asset',
            '附件中没有 .user.js 文件', assets.map((a: any) => a.name).join(', '));
        return;
    }

    // If github_path is configured, find matching asset by name
    let targetAsset: any;
    if (script.githubPath) {
        targetAsset = scriptAssets.find((a: any) => a.name.includes(script.githubPath));
        if (!targetAsset) {
            logEvent(script.id, 'release', 'asset_mismatch',
                `未找到名称匹配 "${script.githubPath}" 的附件`, scriptAssets.map((a: any) => a.name).join(', '));
            return;
        }
    } else {
        // Take the first .user.js asset
        targetAsset = scriptAssets[0];
    }

    const downloadUrl = targetAsset.browser_download_url;
    logEvent(script.id, 'release', action,
        `${releaseName} (${tagName}) → ${isPreRelease ? '🧪 canary' : '🟢 stable'}`,
        `asset: ${targetAsset.name}, size: ${targetAsset.size}`);

    // Download the asset
    try {
        const response = await fetch(downloadUrl);
        if (!response.ok) {
            logEvent(script.id, 'release', 'download_failed',
                `下载附件失败: HTTP ${response.status}`, downloadUrl);
            return;
        }

        const code = await response.text();
        if (!code) {
            logEvent(script.id, 'release', 'empty_asset', '附件内容为空', downloadUrl);
            return;
        }

        // Parse version: prefer tag name (strip leading v), fallback to @version in code
        const versionMatch = code.match(/\/\/\s*@version\s+(.+)/);
        const codeVersion = versionMatch ? versionMatch[1].trim() : '0.0.0';
        const newVersion = (tagName.startsWith('v') || tagName.startsWith('V'))
            ? tagName.replace(/^[vV]/, '')
            : codeVersion;

        // Update the appropriate channel
        const channel = isPreRelease ? 'canary' : 'stable';
        if (channel === 'canary') {
            db.update(scripts).set({
                canaryCode: code,
                canaryVersion: newVersion,
            }).where(eq(scripts.id, script.id)).run();
        } else {
            db.update(scripts).set({
                code,
                version: newVersion,
            }).where(eq(scripts.id, script.id)).run();
        }

        logEvent(script.id, 'release', 'updated',
            `[${channel}] v${newVersion} 已更新 (${targetAsset.name})`, downloadUrl);
    } catch (err: any) {
        logEvent(script.id, 'release', 'error',
            `更新失败: ${err.message}`, downloadUrl);
    }
}

export default router;
