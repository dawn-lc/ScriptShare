/**
 * Cap CAPTCHA 求解器。
 * 直接求解 @cap.js/server 的 PoW 挑战，不使用 cap-widget。
 */

const CAP_API = `${window.location.origin}/api/cap/`;

/**
 * FNV-1a 哈希（32 位），与 @cap.js/server 的 prng 实现一致。
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
 * 确定性十六进制字符串生成器，与 @cap.js/server 的 prng 一致。
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
 * SHA-256 哈希（十六进制输出）。
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
 * 生成一组 [salt, target] 子挑战。
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
 * 求解单个子挑战：找到 nonce，使得 SHA256(salt + nonce) 以 target 开头。
 * target="" 时任何 nonce 都有效（立即返回 0）。
 * 每 YIELD_INTERVAL 次哈希让出事件循环以保持 UI 响应。
 */
const YIELD_INTERVAL = 2000;

async function solveSubChallenge(salt: string, target: string): Promise<number> {
    if (!target) return 0; // target 为空时任意 nonce 都有效

    // 高难度时自适应增加最大尝试次数
    // target 长度 = d（十六进制字符数），有效位数 = d * 4
    const bits = target.length * 4;
    const expectedAttempts = Math.pow(2, bits);
    const maxAttempts = Math.max(500000, Math.min(Math.round(expectedAttempts * 3), 5000000));

    // 优先尝试数值 nonce（最常见）
    for (let nonce = 0; nonce < maxAttempts; nonce++) {
        const hash = await sha256(salt + nonce);
        if (hash.startsWith(target)) return nonce;
        // 定期让出事件循环，保持 UI 响应
        if (nonce > 0 && nonce % YIELD_INTERVAL === 0) {
            await new Promise((r) => setTimeout(r, 0));
        }
    }

    // 兜底：尝试字符串 nonce
    for (let nonce = 0; nonce < maxAttempts; nonce++) {
        const hash = await sha256(salt + 'n' + nonce.toString(16));
        if (hash.startsWith(target)) return nonce;
        if (nonce > 0 && nonce % YIELD_INTERVAL === 0) {
            await new Promise((r) => setTimeout(r, 0));
        }
    }

    throw new Error(`无法求解挑战 target="${target}" (bits=${bits}, max=${maxAttempts})`);
}

/**
 * 从服务器获取挑战、求解并兑换为验证 token。
 *
 * @param onProgress - 可选的进度回调（0-100）
 * @returns 验证 token
 */
export async function solveCapChallenge(
    onProgress?: (pct: number) => void,
): Promise<string> {
    // 第 1 步：获取挑战
    const challengeResp = await fetch(`${CAP_API}challenge`, { method: 'POST' });
    const challengeData = await challengeResp.json();

    const { challenge, token } = challengeData;
    const { c, s, d } = challenge;

    // 第 2 步：生成子挑战列表
    const subChallenges = generateSubChallenges(token, c, s, d);

    // 第 3 步：逐个求解
    const solutions: number[] = [];
    for (let i = 0; i < subChallenges.length; i++) {
        const [salt, target] = subChallenges[i];
        const nonce = await solveSubChallenge(salt, target);
        solutions.push(nonce);
        onProgress?.(Math.round(((i + 1) / subChallenges.length) * 100));
        // 让出事件循环使 React 能渲染进度
        await new Promise((r) => setTimeout(r, 0));
    }

    // 第 4 步：兑换解决方案为验证 token
    const redeemResp = await fetch(`${CAP_API}redeem`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, solutions }),
    });
    const redeemData = await redeemResp.json();

    if (!redeemData.success) {
        throw new Error(redeemData.error || redeemData.message || 'verify_failed');
    }

    return redeemData.token;
}
