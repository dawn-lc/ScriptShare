/**
 * Browser fingerprint-based risk control.
 * Tracks visitor activity and calculates a risk score multiplier
 * used to adjust PoW captcha difficulty.
 */
import { db } from '../db';
import { visitorLogs, users } from '../db';
import { getRiskConfig } from '../config/risk';
import { eq, and, gt, ne, count, countDistinct, desc } from 'drizzle-orm';

export interface VisitorEvent {
    visitorId: string;
    action: string;
    envScore?: number;
    fpConfidence?: number;
    ipHash?: string;
    metadata?: Record<string, unknown>;
}

export interface RiskAssessment {
    /** 1.0 = normal, higher = more risky, used as difficulty multiplier */
    multiplier: number;
    /** Human-readable reason */
    reason: string;
    /** Detailed signals that contributed */
    signals: RiskSignal[];
}

interface RiskSignal {
    name: string;
    weight: number;
    detail: string;
}

/**
 * Log a visitor event for future risk assessment.
 */
export function logVisitorEvent(event: VisitorEvent): void {
    try {
        db.insert(visitorLogs).values({
            visitorId: event.visitorId,
            action: event.action,
            envScore: event.envScore ?? null,
            fpConfidence: event.fpConfidence ?? null,
            ipHash: event.ipHash ?? '',
            metadata: event.metadata ? JSON.stringify(event.metadata) : '',
        }).run();
    } catch (err) {
        console.error('[risk] Failed to log visitor event:', err);
    }
}

/**
 * Assess risk for a given visitor ID.
 * Returns a multiplier and explanation.
 * @param visitorId - The visitor's fingerprint ID
 * @param currentIpHash - Optional IP hash for cross-validation signals
 */
export function assessRisk(visitorId: string, currentIpHash?: string): RiskAssessment {
    const cfg = getRiskConfig();
    const signals: RiskSignal[] = [];
    let multiplier = cfg.multiplierMin;

    const freqCutoff = new Date(Date.now() - cfg.challengeFreqWindow).toISOString();
    const regCutoff = new Date(Date.now() - cfg.registrationRateWindow).toISOString();
    const ipCutoff = new Date(Date.now() - cfg.ipCrossWindow).toISOString();

    // ── Signal 1: Challenge frequency ──
    const [freqRow] = db.select({ cnt: count() }).from(visitorLogs)
        .where(and(
            eq(visitorLogs.visitorId, visitorId),
            eq(visitorLogs.action, 'challenge'),
            gt(visitorLogs.createdAt, freqCutoff),
        )).all();
    const challengeCount = freqRow?.cnt ?? 0;
    if (challengeCount > cfg.freqHighThreshold) {
        const factor = Math.min(challengeCount / 20, cfg.freqHighMaxFactor);
        signals.push({ name: 'high_frequency', weight: factor, detail: `${challengeCount} 次挑战/小时` });
        multiplier = Math.max(multiplier, factor);
    } else if (challengeCount > cfg.freqElevatedThreshold) {
        signals.push({ name: 'elevated_frequency', weight: cfg.freqElevatedFactor, detail: `${challengeCount} 次挑战/小时` });
        multiplier = Math.max(multiplier, cfg.freqElevatedFactor);
    }

    // ── Signal 2: Previously flagged as bot ──
    const [botRow] = db.select({ cnt: count() }).from(visitorLogs)
        .where(and(
            eq(visitorLogs.visitorId, visitorId),
            eq(visitorLogs.action, 'challenge'),
            gt(visitorLogs.envScore, cfg.botHistoryEnvThreshold - 0.001),
        )).all();
    if (botRow && botRow.cnt >= cfg.botHistoryMinCount) {
        signals.push({ name: 'bot_history', weight: cfg.botHistoryWeight, detail: `${botRow.cnt} 次历史 bot 检测` });
        multiplier = Math.max(multiplier, cfg.botHistoryWeight);
    }

    // ── Signal 3: Low fingerprint confidence ──
    const lastFp = db.select({ fpConfidence: visitorLogs.fpConfidence }).from(visitorLogs)
        .where(and(
            eq(visitorLogs.visitorId, visitorId),
            eq(visitorLogs.action, 'challenge'),
        ))
        .orderBy(desc(visitorLogs.createdAt))
        .limit(1)
        .get();

    if (lastFp?.fpConfidence !== null && lastFp?.fpConfidence !== undefined) {
        const conf = Number(lastFp.fpConfidence);
        if (conf < cfg.fpLowThreshold) {
            signals.push({ name: 'low_fp_confidence', weight: cfg.fpLowWeight, detail: `指纹置信度 ${conf}` });
            multiplier = Math.max(multiplier, cfg.fpLowWeight);
        } else if (conf < cfg.fpMediumThreshold) {
            signals.push({ name: 'low_fp_confidence', weight: cfg.fpMediumWeight, detail: `指纹置信度 ${conf}` });
            multiplier = Math.max(multiplier, cfg.fpMediumWeight);
        }
    }

    // ── Signal 4: Multiple accounts from same visitor ──
    // Read all users' env_info and count those matching this visitorId (JSON parsed in TS)
    const allUsers = db.select({ envInfo: users.envInfo }).from(users).all();
    const accountCount = allUsers.filter((u: { envInfo: string | null }) => {
        try {
            const info = JSON.parse(u.envInfo || '{}');
            return info.visitorId === visitorId;
        } catch { return false; }
    }).length;
    if (accountCount >= cfg.multiAccountMinCount) {
        const factor = Math.min(accountCount, cfg.multiAccountMaxFactor);
        signals.push({ name: 'multi_account', weight: factor, detail: `${accountCount} 个账号关联同一指纹` });
        multiplier = Math.max(multiplier, factor);
    }

    // ── Signal 5: Rapid registration attempts ──
    const [regRow] = db.select({ cnt: count() }).from(visitorLogs)
        .where(and(
            eq(visitorLogs.visitorId, visitorId),
            eq(visitorLogs.action, 'register_attempt'),
            gt(visitorLogs.createdAt, regCutoff),
        )).all();
    const regCount = regRow?.cnt ?? 0;
    if (regCount >= cfg.regHighThreshold) {
        signals.push({ name: 'rapid_registration', weight: cfg.regHighWeight, detail: `${regCount} 次注册尝试/天` });
        multiplier = Math.max(multiplier, cfg.regHighWeight);
    } else if (regCount >= cfg.regMediumThreshold) {
        signals.push({ name: 'rapid_registration', weight: cfg.regMediumWeight, detail: `${regCount} 次注册尝试/天` });
        multiplier = Math.max(multiplier, cfg.regMediumWeight);
    }

    // ── Signal 6: Same IP seen with many different visitorIds (proxy/VPN) ──
    if (currentIpHash) {
        const [ipRow] = db.select({ cnt: countDistinct(visitorLogs.visitorId) }).from(visitorLogs)
            .where(and(
                eq(visitorLogs.ipHash, currentIpHash),
                ne(visitorLogs.visitorId, visitorId),
                gt(visitorLogs.createdAt, ipCutoff),
            )).all();
        const distinctVisitors = ipRow?.cnt ?? 0;
        if (distinctVisitors >= cfg.ipManyVisitorsHigh) {
            signals.push({ name: 'ip_many_visitors', weight: cfg.ipManyVisitorsHighWeight, detail: `同一IP关联${distinctVisitors}个不同指纹` });
            multiplier = Math.max(multiplier, cfg.ipManyVisitorsHighWeight);
        } else if (distinctVisitors >= cfg.ipManyVisitorsMedium) {
            signals.push({ name: 'ip_many_visitors', weight: cfg.ipManyVisitorsMediumWeight, detail: `同一IP关联${distinctVisitors}个不同指纹` });
            multiplier = Math.max(multiplier, cfg.ipManyVisitorsMediumWeight);
        } else if (distinctVisitors >= cfg.ipManyVisitorsLow) {
            signals.push({ name: 'ip_many_visitors', weight: cfg.ipManyVisitorsLowWeight, detail: `同一IP关联${distinctVisitors}个不同指纹` });
            multiplier = Math.max(multiplier, cfg.ipManyVisitorsLowWeight);
        }

        // ── Signal 7: Same visitorId seen from many different IPs (IP rotation) ──
        const [visIpRow] = db.select({ cnt: countDistinct(visitorLogs.ipHash) }).from(visitorLogs)
            .where(and(
                eq(visitorLogs.visitorId, visitorId),
                ne(visitorLogs.ipHash, ''),
                ne(visitorLogs.ipHash, currentIpHash),
                gt(visitorLogs.createdAt, ipCutoff),
            )).all();
        const distinctIps = visIpRow?.cnt ?? 0;
        if (distinctIps >= cfg.visitorManyIpsHigh) {
            signals.push({ name: 'visitor_many_ips', weight: cfg.visitorManyIpsHighWeight, detail: `同一指纹使用${distinctIps}个不同IP` });
            multiplier = Math.max(multiplier, cfg.visitorManyIpsHighWeight);
        } else if (distinctIps >= cfg.visitorManyIpsMedium) {
            signals.push({ name: 'visitor_many_ips', weight: cfg.visitorManyIpsMediumWeight, detail: `同一指纹使用${distinctIps}个不同IP` });
            multiplier = Math.max(multiplier, cfg.visitorManyIpsMediumWeight);
        }
    }

    // Clamp multiplier
    multiplier = Math.max(cfg.multiplierMin, Math.min(multiplier, cfg.multiplierMax));

    const reason = signals.length > 0
        ? `风控触发: ${signals.map(s => s.detail).join('; ')}`
        : '正常访问';

    return { multiplier, reason, signals };
}

/**
 * Combine envScore and risk multiplier into a single 0-1 difficulty value.
 *
 *   difficulty = max(envScore, (multiplier - multiplierMin) / (multiplierMax - multiplierMin))
 *
 * 0.0 = normal browser, no risk → easiest PoW
 * 1.0 = confirmed bot + high risk → hardest PoW
 */
export function computeDifficulty(envScore: number | undefined, multiplier: number): number {
    const cfg = getRiskConfig();
    const envFactor = envScore ? Math.max(0, Math.min(envScore, 1)) : 0;
    const multiplierRange = cfg.multiplierMax - cfg.multiplierMin;
    const riskFactor = multiplierRange > 0 ? Math.max(0, Math.min((multiplier - cfg.multiplierMin) / multiplierRange, 1)) : 0;
    return Math.max(envFactor, riskFactor);
}

/**
 * Map a unified difficulty value (0-1) to challenge parameters.
 */
export function difficultyToParams(difficulty: number): { challengeCount: number; challengeDifficulty: number } {
    const cfg = getRiskConfig();
    const clamped = Math.max(0, Math.min(1, difficulty));

    // challengeCount: linear interpolation between min and max
    const count = Math.round(cfg.difficultyMinCount + clamped * (cfg.difficultyMaxCount - cfg.difficultyMinCount));

    // challengeDifficulty: switch at threshold
    const d = clamped >= cfg.difficultyDThreshold ? cfg.difficultyDHard : cfg.difficultyDEasy;

    return { challengeCount: count, challengeDifficulty: d };
}
