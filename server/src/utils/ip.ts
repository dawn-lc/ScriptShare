/**
 * IP address utilities.
 * Handles reverse proxy headers and consistent IP hashing for privacy.
 */
import crypto from 'crypto';
import type { Request } from 'express';

/**
 * Get the real client IP address, respecting reverse proxy headers.
 *
 * Order of precedence:
 *   1. X-Forwarded-For (first IP)   — for reverse proxy setups (Nginx, Caddy, etc.)
 *   2. X-Real-IP                     — alternative proxy header
 *   3. req.ip                        — Express's resolved IP (requires `trust proxy`)
 *   4. req.socket.remoteAddress      — direct TCP connection (fallback)
 */
export function getClientIp(req: Request): string {
    // X-Forwarded-For: client, proxy1, proxy2
    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string') {
        const first = forwarded.split(',')[0].trim();
        if (first) return first;
    }

    // X-Real-IP (less common but used by some setups)
    const realIp = req.headers['x-real-ip'];
    if (typeof realIp === 'string' && realIp) return realIp;

    // Express trust proxy setting or direct connection
    return req.ip ?? req.socket.remoteAddress ?? 'unknown';
}

/**
 * Hash an IP address for privacy-compliant storage (SHA-256, 16 hex chars).
 * Produces a consistent hash so we can count distinct IPs without storing raw IPs.
 */
export function hashIP(ip: string): string {
    return crypto.createHash('sha256').update(ip).digest('hex').substring(0, 16);
}

/**
 * Convenience: get client IP and immediately hash it.
 */
export function getClientIpHash(req: Request): string {
    return hashIP(getClientIp(req));
}
