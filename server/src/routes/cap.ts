/**
 * Cap CAPTCHA 路由。
 * 提供注册用的 PoW 挑战创建与验证。
 */
import { Router, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { db, capChallenges, capTokens } from '../db';
import { eq, and, gt, lte } from 'drizzle-orm';
import { getClientIp } from '../utils/ip';
import cap from '../utils/cap';
import { audit } from '../utils/audit';
import { CAP_CHALLENGE_LIMIT_MAX, CAP_REDEEM_LIMIT_MAX } from '../config';

const router = Router();

// ── 惰性清理：每批请求最多执行一次 DELETE，减少数据库开销 ──
let lastCleanup = 0;
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5 分钟

router.use((_req, _res, next) => {
    const now = Date.now();
    if (now - lastCleanup > CLEANUP_INTERVAL_MS) {
        lastCleanup = now;
        try {
            db.delete(capChallenges).where(lte(capChallenges.expires, now)).run();
            db.delete(capTokens).where(lte(capTokens.expires, now)).run();
        } catch {
            // 静默处理
        }
    }
    next();
});

// 限流：创建挑战和兑换操作
const challengeLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 分钟
    max: CAP_CHALLENGE_LIMIT_MAX,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: '操作过于频繁，请稍后再试' },
});

const redeemLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 分钟
    max: CAP_REDEEM_LIMIT_MAX,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: '操作过于频繁，请稍后再试' },
});

// POST /api/cap/challenge - 创建新的 PoW 挑战（绑定客户端 IP）
router.post('/challenge', challengeLimiter, async (req: Request, res: Response) => {
    try {
        const challenge = await cap.createChallenge({
            challengeDifficulty: 5,
            challengeCount: 80,
        });

        // 将发起者的 IP 写入挑战数据，兑换时校验一致性
        const clientIp = getClientIp(req);
        db.update(capChallenges).set({
            data: JSON.stringify({
                ...challenge.challenge,
                creatorIp: clientIp,
            }),
        }).where(eq(capChallenges.token, challenge.token)).run();

        res.json(challenge);
    } catch (err: unknown) {
        console.error('[cap] Failed to create challenge:', err);
        res.status(500).json({ error: '创建挑战失败' });
    }
});

// POST /api/cap/redeem - 校验挑战解答并获取 token（校验 IP 一致性）
router.post('/redeem', redeemLimiter, async (req: Request, res: Response) => {
    try {
        const { token, solutions } = req.body;
        if (!token || !solutions || !Array.isArray(solutions)) {
            res.status(400).json({ success: false, error: '缺少必要参数' });
            return;
        }

        // 检查 IP 一致性：只有创建挑战的客户端才能兑换
        const row = db.select().from(capChallenges)
            .where(and(eq(capChallenges.token, token), gt(capChallenges.expires, Date.now())))
            .get();
        if (!row) {
            res.status(400).json({ success: false, error: '挑战不存在或已过期' });
            return;
        }
        const challengeData = JSON.parse(row.data) as Record<string, unknown>;
        const creatorIp = challengeData.creatorIp as string | undefined;
        if (creatorIp && creatorIp !== getClientIp(req)) {
            res.status(403).json({ success: false, error: 'IP 不匹配，请重新获取挑战' });
            return;
        }

        const result = await cap.redeemChallenge({ token, solutions });

        // 审计：验证码已解决
        if (result.success) {
            audit('captcha.solved', null, `验证码已解决`, { token: token.slice(0, 8) + '...' });
        }

        res.json(result);
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('[cap] Redeem failed:', msg);
        res.status(400).json({ success: false, error: msg || '验证失败' });
    }
});

// POST /api/cap/verify - 验证已兑换的 token（用于注册）
router.post('/verify', redeemLimiter, async (req: Request, res: Response) => {
    try {
        const { token } = req.body;
        if (!token) {
            res.status(400).json({ valid: false, error: '缺少 token' });
            return;
        }
        const valid = await cap.validateToken(token);
        if (valid.success) {
            res.json({ valid: true });
        } else {
            res.json({ valid: false });
        }
    } catch (err: unknown) {
        console.error('[cap] Verify failed:', err);
        res.status(500).json({ valid: false, error: '验证失败' });
    }
});

export default router;
