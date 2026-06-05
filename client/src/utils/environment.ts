/**
 * Browser environment detection using @fingerprintjs/botd and @fingerprintjs/fingerprintjs.
 * Returns a suspicion score (0 = normal, higher = more suspicious)
 * used to increase PoW captcha difficulty for automated tools.
 * Also collects a stable visitorId for cross-session tracking.
 */

interface EnvCheckResult {
    /** 0 = normal browser, positive values indicate suspicious environment */
    score: number;
    /** Human-readable label for logging */
    label: string;
    /** Whether automation was detected */
    isBot: boolean;
    /** Stable visitor identifier from FingerprintJS */
    visitorId?: string;
    /** Fingerprint confidence score (0-1) from FingerprintJS */
    fpConfidence?: number;
}

// ── BotD ──

let botdPromise: Promise<any> | null = null;

async function getBotd(): Promise<any> {
    if (!botdPromise) {
        try {
            const { load } = await import('@fingerprintjs/botd');
            botdPromise = load().catch(() => null);
        } catch {
            botdPromise = Promise.resolve(null);
        }
    }
    return botdPromise;
}

async function detectBotd(): Promise<Pick<EnvCheckResult, 'score' | 'label' | 'isBot'> | null> {
    try {
        const agent = await getBotd();
        if (!agent) return null;
        if (typeof agent.collect === 'function') {
            await agent.collect();
        }
        const result = typeof agent.detect === 'function' ? agent.detect() : await agent.detect();
        const isBot = !!(result?.bot ?? false);
        return { score: isBot ? 1 : 0, label: isBot ? 'Bot detected' : 'Normal browser', isBot };
    } catch {
        return null;
    }
}

// ── FingerprintJS ──

let fpPromise: Promise<any> | null = null;

async function getFingerprintJS(): Promise<any> {
    if (!fpPromise) {
        try {
            const FingerprintJS = await import('@fingerprintjs/fingerprintjs');
            fpPromise = FingerprintJS.default.load().catch(() => null);
        } catch {
            fpPromise = Promise.resolve(null);
        }
    }
    return fpPromise;
}

async function detectFingerprint(): Promise<{ visitorId?: string; confidence?: number }> {
    try {
        const fp = await getFingerprintJS();
        if (!fp) return {};
        const result = await fp.get();
        return {
            visitorId: result.visitorId as string | undefined,
            confidence: (result.confidence as { score?: number })?.score,
        };
    } catch {
        return {};
    }
}

/**
 * Run environment detection and return a suspicion score.
 * Both BotD and FingerprintJS run in parallel.
 */
export async function detectEnvironment(): Promise<EnvCheckResult> {
    const [botd, fp] = await Promise.all([
        detectBotd(),
        detectFingerprint(),
    ]);

    const base: EnvCheckResult = {
        score: 1,
        label: 'BotD unavailable',
        isBot: true,
        visitorId: fp.visitorId,
        fpConfidence: fp.confidence,
    };

    if (botd) {
        base.score = botd.score;
        base.label = botd.label;
        base.isBot = botd.isBot;
    }

    return base;
}


