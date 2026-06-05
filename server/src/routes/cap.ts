/**
 * Cap CAPTCHA routes.
 * Provides endpoints for challenge creation and solution verification.
 */
import { Router, Request, Response } from 'express';
import { db } from '../db';
import { capChallenges } from '../db';
import { eq } from 'drizzle-orm';
import cap from '../utils/cap';
import { getClientIpHash } from '../utils/ip';
import { logVisitorEvent, assessRisk, computeDifficulty, difficultyToParams } from '../utils/risk';

const router = Router();

// POST /api/cap/challenge - Create a new CAPTCHA challenge
// Difficulty is determined by a single 0-1 value combining envScore and risk factors.
router.post('/challenge', async (req: Request, res: Response) => {
    try {
        const envScore = req.query.envScore ? parseFloat(req.query.envScore as string) : undefined;
        const visitorId = req.query.visitorId as string | undefined;
        const fpConfidence = req.query.fpConfidence ? parseFloat(req.query.fpConfidence as string) : undefined;

        // 1. Assess risk from visitor history
        let riskMultiplier = 1;
        if (visitorId) {
            logVisitorEvent({
                visitorId,
                action: 'challenge',
                envScore,
                fpConfidence,
                ipHash: getClientIpHash(req),
            });
            const risk = assessRisk(visitorId, getClientIpHash(req));
            riskMultiplier = risk.multiplier;
            if (risk.multiplier > 1) {
                console.log('[risk] %s  difficulty=%s reason="%s"',
                    visitorId.substring(0, 8), risk.multiplier, risk.reason);
            }
        }

        // 2. Compute unified difficulty 0-1 from envScore + risk multiplier
        const difficulty = computeDifficulty(envScore, riskMultiplier);

        // 3. Map to challenge params
        const params = difficultyToParams(difficulty);
        console.log('[cap] difficulty=' + difficulty.toFixed(2) + ' → count=' + params.challengeCount + ' d=' + params.challengeDifficulty);

        const challenge = await cap.createChallenge({
            challengeDifficulty: params.challengeDifficulty,
            challengeCount: params.challengeCount,
        });

        // Bind visitorId to the stored challenge data
        if (visitorId && challenge?.token) {
            db.update(capChallenges).set({ visitorId }).where(eq(capChallenges.token, challenge.token)).run();
        }

        res.json(challenge);
    } catch (err: any) {
        console.error('[cap] Failed to create challenge:', err);
        res.status(500).json({ error: '创建挑战失败' });
    }
});

// POST /api/cap/redeem - Verify a challenge solution and obtain a token
router.post('/redeem', async (req: Request, res: Response) => {
    try {
        const { token, solutions, visitorId: visitor_id } = req.body;
        if (!token || !solutions || !Array.isArray(solutions)) {
            res.status(400).json({ success: false, error: '缺少必要参数' });
            return;
        }

        // Verify visitorId binding: if the challenge was created with a visitorId,
        // the redeemer must provide the same one (prevents token theft / visitorId switching).
        const stored = db.select({ visitorId: capChallenges.visitorId }).from(capChallenges)
            .where(eq(capChallenges.token, token)).get();
        if (stored && stored.visitorId && stored.visitorId !== visitor_id) {
            res.status(403).json({ success: false, error: 'visitorId 不匹配' });
            return;
        }

        const result = await cap.redeemChallenge({ token, solutions });
        res.json(result);
    } catch (err: any) {
        console.error('[cap] Redeem failed:', err.message);
        res.status(400).json({ success: false, error: err.message || '验证失败' });
    }
});

// POST /api/cap/verify - Validate a previously-redeemed token (for use in registration)
router.post('/verify', async (req: Request, res: Response) => {
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
    } catch (err: any) {
        console.error('[cap] Verify failed:', err);
        res.status(500).json({ valid: false, error: '验证失败' });
    }
});

export default router;
