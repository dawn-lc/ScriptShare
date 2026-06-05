/**
 * Risk control configuration with env var overrides.
 * All values have sane defaults; override via environment variables.
 */

export interface RiskConfig {
    /** Time windows for frequency checks (milliseconds) */
    challengeFreqWindow: number;
    registrationRateWindow: number;
    ipCrossWindow: number;

    /** Challenge frequency signal */
    freqHighThreshold: number;    // challenges/hour to trigger high factor
    freqElevatedThreshold: number;
    freqHighMaxFactor: number;
    freqElevatedFactor: number;

    /** Bot history signal */
    botHistoryMinCount: number;
    botHistoryWeight: number;
    botHistoryEnvThreshold: number; // envScore threshold for "flagged as bot"

    /** Low FP confidence signal */
    fpLowThreshold: number;
    fpMediumThreshold: number;
    fpLowWeight: number;
    fpMediumWeight: number;

    /** Multi-account signal */
    multiAccountMinCount: number;
    multiAccountMaxFactor: number;

    /** Rapid registration signal */
    regHighThreshold: number;   // attempts/day
    regMediumThreshold: number;
    regHighWeight: number;
    regMediumWeight: number;

    /** IP cross-validation signals */
    ipManyVisitorsHigh: number;
    ipManyVisitorsMedium: number;
    ipManyVisitorsLow: number;
    ipManyVisitorsHighWeight: number;
    ipManyVisitorsMediumWeight: number;
    ipManyVisitorsLowWeight: number;

    visitorManyIpsHigh: number;
    visitorManyIpsMedium: number;
    visitorManyIpsHighWeight: number;
    visitorManyIpsMediumWeight: number;

    /** Multiplier clamp */
    multiplierMin: number;
    multiplierMax: number;

    /** Difficulty mapping */
    difficultyMinCount: number;
    difficultyMaxCount: number;
    difficultyDThreshold: number;
    difficultyDEasy: number;
    difficultyDHard: number;
}

function env(key: string, fallback: number): number {
    const raw = process.env[`RISK_${key}`];
    if (raw === undefined || raw === '') return fallback;
    const val = Number(raw);
    return Number.isFinite(val) ? val : fallback;
}

/** Default configuration, overridable via RISK_* environment variables. */
export function loadRiskConfig(): RiskConfig {
    return {
        challengeFreqWindow: env('CHALLENGE_FREQ_WINDOW', 3600_000),      // 1 hour
        registrationRateWindow: env('REG_RATE_WINDOW', 86_400_000),         // 1 day
        ipCrossWindow: env('IP_CROSS_WINDOW', 86_400_000),         // 1 day

        freqHighThreshold: env('FREQ_HIGH_THRESHOLD', 50),
        freqElevatedThreshold: env('FREQ_ELEVATED_THRESHOLD', 20),
        freqHighMaxFactor: env('FREQ_HIGH_MAX_FACTOR', 5),
        freqElevatedFactor: env('FREQ_ELEVATED_FACTOR', 2),

        botHistoryMinCount: env('BOT_HISTORY_MIN_COUNT', 3),
        botHistoryWeight: env('BOT_HISTORY_WEIGHT', 3),
        botHistoryEnvThreshold: env('BOT_HISTORY_ENV_THRESHOLD', 0.8),

        fpLowThreshold: env('FP_LOW_THRESHOLD', 0.3),
        fpMediumThreshold: env('FP_MEDIUM_THRESHOLD', 0.5),
        fpLowWeight: env('FP_LOW_WEIGHT', 2.5),
        fpMediumWeight: env('FP_MEDIUM_WEIGHT', 1.5),

        multiAccountMinCount: env('MULTI_ACCOUNT_MIN_COUNT', 3),
        multiAccountMaxFactor: env('MULTI_ACCOUNT_MAX_FACTOR', 5),

        regHighThreshold: env('REG_HIGH_THRESHOLD', 5),
        regMediumThreshold: env('REG_MEDIUM_THRESHOLD', 2),
        regHighWeight: env('REG_HIGH_WEIGHT', 3),
        regMediumWeight: env('REG_MEDIUM_WEIGHT', 1.5),

        ipManyVisitorsHigh: env('IP_MANY_VISITORS_HIGH', 10),
        ipManyVisitorsMedium: env('IP_MANY_VISITORS_MEDIUM', 5),
        ipManyVisitorsLow: env('IP_MANY_VISITORS_LOW', 3),
        ipManyVisitorsHighWeight: env('IP_MANY_VISITORS_HIGH_WEIGHT', 3),
        ipManyVisitorsMediumWeight: env('IP_MANY_VISITORS_MEDIUM_WEIGHT', 2),
        ipManyVisitorsLowWeight: env('IP_MANY_VISITORS_LOW_WEIGHT', 1.5),

        visitorManyIpsHigh: env('VISITOR_MANY_IPS_HIGH', 5),
        visitorManyIpsMedium: env('VISITOR_MANY_IPS_MEDIUM', 3),
        visitorManyIpsHighWeight: env('VISITOR_MANY_IPS_HIGH_WEIGHT', 3),
        visitorManyIpsMediumWeight: env('VISITOR_MANY_IPS_MEDIUM_WEIGHT', 2),

        multiplierMin: env('MULTIPLIER_MIN', 1),
        multiplierMax: env('MULTIPLIER_MAX', 10),

        difficultyMinCount: env('DIFFICULTY_MIN_COUNT', 50),
        difficultyMaxCount: env('DIFFICULTY_MAX_COUNT', 1000),
        difficultyDThreshold: env('DIFFICULTY_D_THRESHOLD', 0.3),
        difficultyDEasy: env('DIFFICULTY_D_EASY', 4),
        difficultyDHard: env('DIFFICULTY_D_HARD', 5),
    };
}

/** Singleton config, lazily loaded. */
let _config: RiskConfig | null = null;

export function getRiskConfig(): RiskConfig {
    if (!_config) {
        _config = loadRiskConfig();
    }
    return _config;
}
