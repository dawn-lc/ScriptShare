/**
 * CAPTCHA 路由。
 * 提供注册用的 PoW 挑战创建与验证。
 */
import { Router, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import crypto from 'crypto';
import { argon2id } from 'hash-wasm';
import { captchaRepo } from '../db/repos';
import { audit } from '../utils/audit';
import {
    CAPTCHA_CHALLENGE_LIMIT_MAX, CAPTCHA_REDEEM_LIMIT_MAX,
    CAPTCHA_SIGN_SECRET, CAPTCHA_SIGN_EXPIRES_MS, CAPTCHA_TOKEN_EXPIRES_MS,
    CAPTCHA_POW_COUNT, CAPTCHA_POW_SALT_LEN, CAPTCHA_POW_DIFFICULTY,
    CAPTCHA_POW_MEMORY, CAPTCHA_POW_ITERATIONS, CAPTCHA_POW_PARALLELISM,
} from '../config';

/** 用 HMAC-SHA256 做确定性派生，替代手写 PRNG。密码学安全。 */
function hmacDerive(key: string, data: string | number, length: number): string {
    return crypto.createHmac('sha256', key)
        .update(String(data))
        .digest('hex')
        .substring(0, length);
}

/** Argon2id 参数（从 .env 读取，memorySize 为 KiB） */
const ARGON2_OPT = { memorySize: CAPTCHA_POW_MEMORY, iterations: CAPTCHA_POW_ITERATIONS, parallelism: CAPTCHA_POW_PARALLELISM, hashLength: 32, outputType: 'hex' as const };

/** PoW 挑战参数（从 .env 读取，与客户端 solver 联动） */
const CHALLENGE_PARAMS = { count: CAPTCHA_POW_COUNT, saltLen: CAPTCHA_POW_SALT_LEN, difficulty: CAPTCHA_POW_DIFFICULTY } as const;
async function memoryHash(key: string, salt: string): Promise<string> {
    return argon2id({ password: key, salt, ...ARGON2_OPT });
}

const router = Router();

// ── 惰性清理：每批请求最多执行一次 DELETE，减少数据库开销 ──
let lastCleanup = 0;
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5 分钟

router.use((_req, _res, next) => {
    const now = Date.now();
    if (now - lastCleanup > CLEANUP_INTERVAL_MS) {
        lastCleanup = now;
        captchaRepo.cleanupExpiredTokens().catch(() => {
            // 静默处理
        });
    }
    next();
});

// 限流：创建挑战和兑换操作
const challengeLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 分钟
    max: CAPTCHA_CHALLENGE_LIMIT_MAX,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: '操作过于频繁，请稍后再试' },
});

const redeemLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 分钟
    max: CAPTCHA_REDEEM_LIMIT_MAX,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: '操作过于频繁，请稍后再试' },
});

// POST /api/cap/challenge - 创建新的 PoW 挑战（附 HMAC 签名，无状态）
router.post('/challenge', challengeLimiter, async (req: Request, res: Response) => {
    try {
        const { count, saltLen, difficulty } = CHALLENGE_PARAMS;

        // 自生成 token + HMAC 签名，使兑换无需查表
        const token = crypto.randomBytes(25).toString('hex');
        const expires = Date.now() + CAPTCHA_SIGN_EXPIRES_MS;
        const sig = crypto.createHmac('sha256', CAPTCHA_SIGN_SECRET)
            .update(`${token}:${count}:${saltLen}:${difficulty}:${expires}`)
            .digest('hex');

        res.json({ challenge: { count, saltLen, difficulty, argon2: { memorySize: ARGON2_OPT.memorySize, iterations: ARGON2_OPT.iterations, parallelism: ARGON2_OPT.parallelism } }, token, sig, expires });
    } catch (err: unknown) {
        console.error('[cap] Failed to create challenge:', err);
        res.status(500).json({ error: '创建挑战失败' });
    }
});

// POST /api/cap/redeem - 校验挑战解答并获取 token（验 HMAC 签名，无需查表）
router.post('/redeem', redeemLimiter, async (req: Request, res: Response) => {
    try {
        const { token, solutions, sig, count: rawCount, saltLen: rawSaltLen, difficulty: rawDifficulty } = req.body;
        if (!token || !solutions || !Array.isArray(solutions) || !sig) {
            res.status(400).json({ success: false, error: '缺少必要参数' });
            return;
        }

        // 验签：恢复挑战参数
        const count = Number(rawCount) || 128;
        const saltLen = Number(rawSaltLen) || 32;
        const difficulty = Number(rawDifficulty) || 5;

        // 从签名中恢复 expires（签名载荷不含，但从请求体获取）
        const { expires: rawExpires } = req.body;
        const expires = Number(rawExpires) || 0;
        if (Date.now() > expires) {
            res.status(400).json({ success: false, error: '挑战已过期' });
            return;
        }

        const expectedSig = crypto.createHmac('sha256', CAPTCHA_SIGN_SECRET)
            .update(`${token}:${count}:${saltLen}:${difficulty}:${expires}`)
            .digest('hex');
        // 恒定时间比较
        if (sig.length !== expectedSig.length ||
            !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSig))) {
            res.status(403).json({ success: false, error: '签名无效，请重新获取挑战' });
            return;
        }

        if (solutions.length !== count) {
            res.status(400).json({ success: false, error: '解答数量不匹配' });
            return;
        }

        // 自定义区块链式验证
        let valid = true;
        for (let i = 0; i < count; i++) {
            const salt = hmacDerive(token, i + 1, saltLen);
            const target = hmacDerive(token, `${i + 1}d`, difficulty);
            if (!target) continue;
            const prevNonce = i === 0 ? 0 : (solutions[i - 1] as number);
            const key = `${salt}:${prevNonce}:${solutions[i]}`;
            const hash = await memoryHash(key, token);
            if (!hash.startsWith(target)) { valid = false; break; }
        }

        if (!valid) {
            res.json({ success: false, error: '解答错误' });
            return;
        }

        // 生成验证 token 并存入数据库
        const vertoken = crypto.randomBytes(15).toString('hex');
        const tokenExpires = Date.now() + CAPTCHA_TOKEN_EXPIRES_MS;
        await captchaRepo.createToken({ key: vertoken, expires: tokenExpires });

        audit('captcha.solved', null, `验证码已解决`, { token: token.slice(0, 8) + '...' });
        res.json({ success: true, token: vertoken, expires: tokenExpires });
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('[cap] Redeem failed:', msg);
        res.status(400).json({ success: false, error: msg || '验证失败' });
    }
});



export default router;
