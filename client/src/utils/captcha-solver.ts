/**
 * Cap CAPTCHA 求解器。
 * 使用 Argon2id 内存硬哈希替代 SHA-256，抵抗 GPU/ASIC 加速。
 */

import { argon2id } from 'hash-wasm';

// ── 类型 ──

export type Argon2Params = { memorySize: number; iterations: number; parallelism: number };

interface ChallengeResponse {
    challenge: { count: number; saltLen: number; difficulty: number; argon2: Argon2Params };
    token: string;
    sig: string;
    expires: number;
}

type ProgressListener = (pct: number) => void;

// ── 常量 ──

const CAPTCHA_API = `${window.location.origin}/api/captcha/`;
const MAX_ATTEMPTS_MULTIPLIER = 10; // 期望值的倍数作为上限
const MIN_ATTEMPTS = 8;

// ── HMAC 派生（与服务端 hmacDerive 算法一致） ──

async function hmacDerive(key: string, data: string | number, length: number): Promise<string> {
    const enc = new TextEncoder();
    const cryptoKey = await crypto.subtle.importKey(
        'raw', enc.encode(key),
        { name: 'HMAC', hash: 'SHA-256' },
        false, ['sign'],
    );
    const sig = await crypto.subtle.sign('HMAC', cryptoKey, enc.encode(String(data)));
    return Array.from(new Uint8Array(sig))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('')
        .substring(0, length);
}

/** 生成一组 [salt, target] 子挑战 */
async function generateSubChallenges(token: string, count: number, saltLen: number, difficulty: number): Promise<[string, string][]> {
    const challenges: [string, string][] = [];
    for (let i = 0; i < count; i++) {
        const [salt, target] = await Promise.all([
            hmacDerive(token, i + 1, saltLen),
            hmacDerive(token, `${i + 1}d`, difficulty),
        ]);
        challenges.push([salt, target]);
    }
    return challenges;
}

/**
 * 求解单个子挑战：找到 nonce 使 Argon2id hash 以 target 开头。
 * 区块链式链式依赖（prevNonce），强制串行计算抵抗并行化。
 */
async function solveSubChallenge(
    salt: string, target: string, prevNonce: number,
    token: string, argon2Opt: Argon2Params,
): Promise<number> {
    if (!target) return 0;

    const bits = target.length * 4;
    const expected = Math.pow(2, bits);
    const maxAttempts = Math.max(MIN_ATTEMPTS, Math.round(expected * MAX_ATTEMPTS_MULTIPLIER));

    for (let nonce = 0; nonce < maxAttempts; nonce++) {
        const key = `${salt}:${prevNonce}:${nonce}`;
        const hash = await argon2id({ ...argon2Opt, hashLength: 32, outputType: 'hex', password: key, salt: token });
        if (hash.startsWith(target)) return nonce;
        // 每轮让出事件循环，保持 UI 响应
        await new Promise((r) => setTimeout(r, 0));
    }

    throw new Error(`Solver failed target="${target}" (bits=${bits}, max=${maxAttempts})`);
}

// ── 服务类 ──

type ServiceState = 'idle' | 'solving' | 'done';

/**
 * CAPTCHA 服务单例——管理挑战生命周期：
 *   idle → solving → done → idle（通过 restart）
 * start() 幂等，restart() 强制重置。
 */
class CaptchaService {
    private _promise: Promise<string> | null = null;
    private _cancel = false;
    private _listeners = new Set<ProgressListener>();
    private _state: ServiceState = 'idle';

    get state(): ServiceState { return this._state; }
    get busy(): boolean { return this._state === 'solving'; }

    subscribe(fn: ProgressListener): () => void {
        this._listeners.add(fn);
        return () => this._listeners.delete(fn);
    }

    start(): Promise<string> {
        return this._promise ?? this.restart();
    }

    restart(): Promise<string> {
        this._cancel = true;
        this._promise = null;
        this._state = 'idle';
        this._cancel = false;

        const promise = this._run().finally(() => {
            if (this._promise === promise) this._promise = null;
        });
        this._promise = promise;
        return promise;
    }

    private checkCancel(): void {
        if (this._cancel) throw Object.assign(new Error('cancelled'), { code: 'CANCELLED' });
    }

    private async _run(): Promise<string> {
        this._state = 'solving';

        try {
            // 1. 获取挑战
            const res = await fetch(`${CAPTCHA_API}challenge`, { method: 'POST' });
            const data: ChallengeResponse = await res.json();
            this.checkCancel();
            const { challenge, token, sig, expires } = data;
            const { count, saltLen, difficulty, argon2 } = challenge;

            // 2. 生成子挑战
            const subChallenges = await generateSubChallenges(token, count, saltLen, difficulty);
            this.checkCancel();

            // 3. 串行求解
            const solutions: number[] = [];
            for (let i = 0; i < subChallenges.length; i++) {
                this.checkCancel();
                const [salt, target] = subChallenges[i];
                const prevNonce = i === 0 ? 0 : solutions[i - 1];
                const nonce = await solveSubChallenge(salt, target, prevNonce, token, argon2);
                solutions.push(nonce);

                const pct = Math.round(((i + 1) / subChallenges.length) * 100);
                this._listeners.forEach(fn => fn(pct));
            }
            this.checkCancel();

            // 4. 兑换
            const redeemRes = await fetch(`${CAPTCHA_API}redeem`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token, solutions, sig, count, saltLen, difficulty, expires }),
            });
            const redeemData = await redeemRes.json();
            this.checkCancel();

            if (!redeemData.success) {
                throw new Error(redeemData.error || redeemData.message || 'verify_failed');
            }

            this._state = 'done';
            return redeemData.token;
        } catch (err: unknown) {
            this._state = 'idle';
            throw err;
        }
    }
}

export const captchaService = new CaptchaService();
