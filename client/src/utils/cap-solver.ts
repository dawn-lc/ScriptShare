/**
 * Cap CAPTCHA solver.
 * Directly solves challenges from @cap.js/server without using the cap-widget.
 */

const CAP_API = `${window.location.origin}/api/cap/`;

/**
 * FNV-1a hash (32-bit), matching @cap.js/server's prng implementation.
 */
function fnv1a(str: string): number {
    let hash = 2166136261;
    for (let i = 0; i < str.length; i++) {
        hash ^= str.charCodeAt(i);
        hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
    }
    return hash >>> 0;
}

/**
 * Deterministic hex string generator, matching @cap.js/server's prng.
 */
function prng(seed: string, length: number): string {
    let state = fnv1a(seed);

    function next(): number {
        state ^= state << 13;
        state ^= state >>> 17;
        state ^= state << 5;
        return state >>> 0;
    }

    let result = '';
    while (result.length < length) {
        result += next().toString(16).padStart(8, '0');
    }
    return result.substring(0, length);
}

/**
 * SHA-256 hash of a string (hex output).
 */
async function sha256(msg: string): Promise<string> {
    const encoder = new TextEncoder();
    const buf = await crypto.subtle.digest('SHA-256', encoder.encode(msg));
    const bytes = new Uint8Array(buf);
    let hex = '';
    for (const b of bytes) hex += b.toString(16).padStart(2, '0');
    return hex;
}

/**
 * Generate the array of [salt, target] pairs for a challenge.
 */
function generateSubChallenges(token: string, c: number, s: number, d: number): [string, string][] {
    const challenges: [string, string][] = [];
    for (let i = 0; i < c; i++) {
        const salt = prng(`${token}${i + 1}`, s);
        const target = prng(`${token}${i + 1}d`, d);
        challenges.push([salt, target]);
    }
    return challenges;
}

/**
 * Solve a single sub-challenge: find a nonce where SHA256(salt + nonce) starts with target.
 * With target="", any nonce works (returns 0 instantly). 
 * Yields to event loop every YIELD_INTERVAL hashes to keep UI responsive.
 */
const YIELD_INTERVAL = 2000;

async function solveSubChallenge(salt: string, target: string): Promise<number> {
    if (!target) return 0; // empty target means any nonce is valid

    // For higher difficulty, increase max attempts adaptively
    // target length = d (number of hex chars), effective bits = d * 4
    const bits = target.length * 4;
    const expectedAttempts = Math.pow(2, bits);
    const maxAttempts = Math.max(500000, Math.min(Math.round(expectedAttempts * 3), 5000000));

    // Try numeric nonces (most common)
    for (let nonce = 0; nonce < maxAttempts; nonce++) {
        const hash = await sha256(salt + nonce);
        if (hash.startsWith(target)) return nonce;
        // Yield to event loop periodically so UI stays responsive
        if (nonce > 0 && nonce % YIELD_INTERVAL === 0) {
            await new Promise((r) => setTimeout(r, 0));
        }
    }

    // Fallback: try string nonces
    for (let nonce = 0; nonce < maxAttempts; nonce++) {
        const hash = await sha256(salt + 'n' + nonce.toString(16));
        if (hash.startsWith(target)) return nonce;
        if (nonce > 0 && nonce % YIELD_INTERVAL === 0) {
            await new Promise((r) => setTimeout(r, 0));
        }
    }

    throw new Error(`Failed to solve challenge with target "${target}" (bits=${bits}, max=${maxAttempts})`);
}

/**
 * Fetch a challenge from the server, solve it, and redeem for a token.
 *
 * @param envScore - Optional environment suspicion score
 * @param onProgress - Optional progress callback (0-100)
 * @param visitorId - Optional FingerprintJS visitor ID for server-side tracking
 * @param fpConfidence - Optional FingerprintJS confidence score
 * @returns The verification token
 */
export async function solveCapChallenge(
    envScore?: number,
    onProgress?: (pct: number) => void,
    visitorId?: string,
    fpConfidence?: number,
): Promise<string> {
    // Step 1: Get challenge
    const params = new URLSearchParams();
    if (envScore !== undefined) params.set('envScore', String(envScore));
    if (visitorId) params.set('visitorId', visitorId);
    if (fpConfidence !== undefined) params.set('fpConfidence', String(fpConfidence));
    const qs = params.toString();
    const challengeResp = await fetch(`${CAP_API}challenge${qs ? `?${qs}` : ''}`, { method: 'POST' });
    const challengeData = await challengeResp.json();

    const { challenge, token } = challengeData;
    const { c, s, d } = challenge;

    // Step 2: Generate sub-challenges
    const subChallenges = generateSubChallenges(token, c, s, d);

    // Step 3: Solve each sub-challenge
    const solutions: number[] = [];
    for (let i = 0; i < subChallenges.length; i++) {
        const [salt, target] = subChallenges[i];
        const nonce = await solveSubChallenge(salt, target);
        solutions.push(nonce);
        onProgress?.(Math.round(((i + 1) / subChallenges.length) * 100));
        // Yield to let React render progress updates
        await new Promise((r) => setTimeout(r, 0));
    }

    // Step 4: Redeem solutions for verification token
    const redeemResp = await fetch(`${CAP_API}redeem`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, solutions, visitorId }),
    });
    const redeemData = await redeemResp.json();

    if (!redeemData.success) {
        throw new Error(redeemData.error || redeemData.message || 'verify_failed');
    }

    return redeemData.token;
}
