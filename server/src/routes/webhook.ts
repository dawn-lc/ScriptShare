import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { webhookRepo, scriptRepo } from '../db/repos';
import { eq } from 'drizzle-orm';
import { audit } from '../utils/audit';

const router = Router();

/**
 * 使用脚本的 webhook_secret 验证 X-Hub-Signature-256。
 * 这是标准的 GitHub webhook 认证方式。
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
 * 将 webhook 事件记录到数据库以供审计
 */
function logEvent(scriptId: number | null, event: string, action: string, summary: string, detail: string): void {
    webhookRepo.create({
        scriptId,
        event,
        action,
        summary,
        detail,
    }).catch(() => {
        // 表可能还不存在 — 忽略
    });
}

// ── 每个脚本的 webhook 端点 ──
// 仅处理 release 事件。脚本文件从 release 的附件中获取，
// 而非 raw.githubusercontent.com。
// Pre-release → canary 频道，正式 Release → stable 频道。

router.post('/scripts/:id', async (req: Request, res: Response) => {
    const scriptId = parseInt(String(req.params.id));
    // Express 请求头类型定义为 string | string[] | undefined，实际运行时为 string
    const signature = req.headers['x-hub-signature-256'] as string | undefined;
    const githubEvent = String(req.headers['x-github-event'] ?? 'unknown');
    // rawBody 由 express.json() 中间件的 verify 回调注入，已在全局类型中声明
    const rawBody = req.rawBody;

    if (isNaN(scriptId)) {
        res.status(400).json({ error: '无效的脚本 ID' });
        return;
    }

    const script = await scriptRepo.findByIdColumns(scriptId, {
        id: true, name: true, webhookSecret: true,
        githubRepo: true, githubPath: true, version: true,
        canaryVersion: true, userId: true,
    }) as ScriptWebhookRow | undefined;

    if (!script) {
        logEvent(null, 'webhook', 'not_found', `脚本 #${scriptId} 不存在`, '');
        res.status(404).json({ error: '脚本不存在' });
        return;
    }

    // 使用脚本的 secret 验证 HMAC-SHA256 签名
    if (!script.webhookSecret) {
        logEvent(scriptId, 'webhook', 'no_secret', '脚本未配置 webhook 密钥', '');
        audit('webhook.received', null, `Webhook 失败: 脚本 ID=${scriptId} 未配置密钥`, { scriptId });
        res.status(403).json({ error: '请先在脚本详情页生成 Webhook Secret' });
        return;
    }

    if (!signature) {
        logEvent(scriptId, 'webhook', 'no_signature', '缺少 X-Hub-Signature-256 头', '');
        audit('webhook.received', null, `Webhook 失败: 脚本 ID=${scriptId} 缺少签名`, { scriptId });
        res.status(401).json({ error: '缺少签名头，请在 GitHub Webhook 配置中填写 Secret' });
        return;
    }

    if (!rawBody || !verifySignature(rawBody, signature, script.webhookSecret)) {
        logEvent(scriptId, 'webhook', 'sig_mismatch', 'HMAC 签名验证失败', '');
        audit('webhook.received', null, `Webhook 失败: 脚本 ID=${scriptId} 签名验证失败`, { scriptId });
        res.status(403).json({ error: '签名验证失败，请检查 GitHub Webhook 中配置的 Secret 是否一致' });
        return;
    }

    // 接受 ping 以测试连通性
    if (githubEvent === 'ping') {
        logEvent(scriptId, 'ping', 'ok', '连接测试成功', '');
        audit('webhook.received', null, `Webhook Ping 成功: 脚本 ID=${scriptId}`, { scriptId });
        res.json({ message: 'pong' });
        return;
    }

    // 仅处理 release 事件
    if (githubEvent !== 'release') {
        logEvent(scriptId, 'ignored', 'unsupported_event', `仅处理 release 事件，忽略 ${githubEvent}`, '');
        audit('webhook.received', null, `Webhook 忽略非 release 事件: ${githubEvent}`, { scriptId, event: githubEvent });
        res.status(200).json({ message: `忽略 ${githubEvent} 事件，仅处理 release` });
        return;
    }

    res.status(202).json({ message: 'webhook 已接收' });
    audit('webhook.received', null, `Webhook 已接收: 脚本 ID=${scriptId} 事件=${githubEvent}`, { scriptId, event: githubEvent });

    // 异步处理 release
    setImmediate(async () => {
        try {
            await handleReleaseEvent(script, req.body);
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            console.error(`[webhook] 脚本 #${scriptId} 处理失败:`, msg);
        }
    });
});

/** GitHub release 附件。 */
interface GitHubAsset {
    name: string;
    browser_download_url: string;
    content_type?: string;
    size?: number;
}

/** 来自 webhook 事件的 GitHub release payload。 */
interface GitHubReleasePayload {
    action?: string;
    release?: {
        tag_name?: string;
        name?: string;
        prerelease?: boolean;
        assets?: GitHubAsset[];
        body?: string;
    };
    repository?: {
        full_name?: string;
    };
    sender?: {
        login?: string;
    };
}

/** 查询脚本 webhook 字段时返回的行结构。 */
interface ScriptWebhookRow {
    id: number;
    name: string;
    webhookSecret: string | null;
    githubRepo: string | null;
    githubPath: string | null;
    canaryVersion: string | null;
    userId: number | null;
}

/**
 * 处理发布事件。
 * - 验证仓库（若配置了 github_repo）
 * - 使用 release.prerelease 布尔值确定频道
 * - 根据 github_path 查找匹配的资源（或第一个 .user.js 资源）
 * - 从 asset.browser_download_url 下载脚本内容
 */
async function handleReleaseEvent(script: ScriptWebhookRow & { id: number }, payload: GitHubReleasePayload): Promise<void> {
    const action = payload.action || 'published';
    const release = payload.release || {};
    const repo = payload.repository?.full_name || '';
    const sender = payload.sender?.login || 'unknown';
    const tagName = release.tag_name || '';
    const isPreRelease = !!release.prerelease;
    const releaseName = release.name || tagName;

    // 仅处理已发布的 release
    if (action !== 'published') {
        logEvent(script.id, 'release', 'ignored', `跳过 action=${action}，仅处理 published`, '');
        return;
    }

    // 验证仓库
    if (script.githubRepo && repo && script.githubRepo !== repo) {
        logEvent(script.id, 'release', 'repo_mismatch',
            `仓库 "${repo}" 不匹配配置的 "${script.githubRepo}"`, '');
        return;
    }

    // 找到包含脚本的附件
    const assets: GitHubAsset[] = release.assets || [];
    if (assets.length === 0) {
        logEvent(script.id, 'release', 'no_assets', 'Release 没有附件，请上传 .user.js 文件作为附件', '');
        return;
    }

    // 筛选 .user.js 附件
    const scriptAssets = assets.filter((a) => a.name && a.name.endsWith('.user.js'));
    if (scriptAssets.length === 0) {
        logEvent(script.id, 'release', 'no_script_asset',
            '附件中没有 .user.js 文件', assets.map((a) => a.name).join(', '));
        return;
    }

    // 如果配置了 github_path，按名称匹配附件
    let targetAsset: GitHubAsset | undefined;
    if (script.githubPath) {
        targetAsset = scriptAssets.find((a) => script.githubPath ? a.name.includes(script.githubPath) : false);
        if (!targetAsset) {
            logEvent(script.id, 'release', 'asset_mismatch',
                `未找到名称匹配 "${script.githubPath}" 的附件`, scriptAssets.map((a) => a.name).join(', '));
            return;
        }
    } else {
        // 取第一个 .user.js 附件
        targetAsset = scriptAssets[0];
    }

    const downloadUrl = targetAsset.browser_download_url;
    logEvent(script.id, 'release', action,
        `${releaseName} (${tagName}) → ${isPreRelease ? '🧪 canary' : '🟢 stable'}`,
        `asset: ${targetAsset.name}, size: ${targetAsset.size}`);

    // 下载附件
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

        // 对下载的脚本进行元数据完整性检测，不合格时拒绝更新
        let newVersion: string;
        try {
            const startTag = '// ==UserScript==';
            const endTag = '// ==/UserScript==';
            const si = code.indexOf(startTag);
            const ei = code.indexOf(endTag, si >= 0 ? si + startTag.length : 0);
            if (si < 0 || ei <= si) {
                logEvent(script.id, 'release', 'meta_rejected', '脚本缺少 UserScript 元数据块，已拒绝更新', '');
                return;
            }
            const block = code.slice(si + startTag.length, ei);
            const lines = block.split('\n').map(l => l.trim()).filter(l => l.startsWith('// @'));
            const meta: Record<string, string[]> = {};
            for (const line of lines) {
                const kv = line.replace('// @', '').trim().split(/\s+(.+)/);
                const k = kv[0];
                const v = kv[1]?.trim() || '';
                if (k) (meta[k] = meta[k] || []).push(v);
            }
            const missing: string[] = [];
            if (!meta.namespace?.length) missing.push('@namespace');
            if (!meta.match?.length && !meta.include?.length) missing.push('@match/@include');
            if (!meta.grant?.length) missing.push('@grant');
            if (!meta.version?.length) missing.push('@version');
            if (missing.length > 0) {
                logEvent(script.id, 'release', 'meta_rejected',
                    `下载的脚本缺少必要元数据: ${missing.join(', ')}，已拒绝更新`, '');
                return;
            }

            // 从代码中解析版本号，回退到标签名
            const versionMatch = code.match(/\/\/\s*@version\s+(.+)/);
            const codeVersion = versionMatch ? versionMatch[1].trim() : '0.0.0';
            newVersion = (tagName.startsWith('v') || tagName.startsWith('V'))
                ? tagName.replace(/^[vV]/, '')
                : codeVersion;
        } catch {
            logEvent(script.id, 'release', 'meta_rejected', '解析脚本元数据时出错，已拒绝更新', '');
            return;
        }

        // 更新对应的频道
        const channel = isPreRelease ? 'canary' : 'stable';
        if (channel === 'canary') {
            await scriptRepo.update(script.id!, {
                canaryCode: code,
                canaryVersion: newVersion,
            });
        } else {
            await scriptRepo.update(script.id!, {
                code,
                version: newVersion,
            });
        }

        logEvent(script.id, 'release', 'updated',
            `[${channel}] v${newVersion} 已更新 (${targetAsset.name})`, downloadUrl);
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        logEvent(script.id, 'release', 'error',
            `更新失败: ${msg}`, downloadUrl);
    }
}

export default router;
