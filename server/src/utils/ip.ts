/**
 * IP 地址工具函数。
 * 处理反向代理头部并为隐私做一致性 IP 哈希。
 */
import crypto from 'crypto';
import type { Request } from 'express';

/**
 * 获取真实客户端 IP，考虑反向代理头部。
 *
 * 优先级：
 *   1. X-Forwarded-For（第一个 IP）— 反向代理环境（Nginx、Caddy 等）
 *   2. X-Real-IP                   — 备用代理头部
 *   3. req.ip                      — Express 解析的 IP（需启用 `trust proxy`）
 *   4. req.socket.remoteAddress    — 直接 TCP 连接（兜底）
 */
export function getClientIp(req: Request): string {
    // X-Forwarded-For 格式：客户端, 代理1, 代理2
    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string') {
        const first = forwarded.split(',')[0].trim();
        if (first) return first;
    }

    // X-Real-IP（较少见，部分环境使用）
    const realIp = req.headers['x-real-ip'];
    if (typeof realIp === 'string' && realIp) return realIp;

    // 使用 Express trust proxy 设置或直连地址
    return req.ip ?? req.socket.remoteAddress ?? 'unknown';
}

/**
 * 对 IP 地址做哈希以合规存储（SHA-256，16 位十六进制）。
 * 生成一致的哈希值，从而在不存储原始 IP 的情况下统计独立访客。
 */
export function hashIP(ip: string): string {
    return crypto.createHash('sha256').update(ip).digest('hex').substring(0, 16);
}

/**
 * 便捷函数：获取客户端 IP 后立即哈希。
 */
export function getClientIpHash(req: Request): string {
    return hashIP(getClientIp(req));
}
