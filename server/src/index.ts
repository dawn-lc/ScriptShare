import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { initDatabase } from './db';
import { PORT, NODE_ENV, isProd, TRUST_PROXY, CORS_ORIGIN, DEBUG_ENABLED, ADMIN_USERNAME, ADMIN_PASSWORD, API_RATE_LIMIT_WINDOW_MS, API_RATE_LIMIT_NO_COOKIE_MAX, API_RATE_LIMIT_GUEST_MAX, API_RATE_LIMIT_USER_MAX, LOGIN_RATE_LIMIT_WINDOW_MS, LOGIN_RATE_LIMIT_MAX, WEBHOOK_RATE_LIMIT_WINDOW_MS, WEBHOOK_RATE_LIMIT_MAX, CAPTCHA_RATE_LIMIT_WINDOW_MS, CAPTCHA_RATE_LIMIT_MAX } from './config';
import { getRequestRole, ensureGuestToken, verifyToken } from './middleware/auth';
import { audit } from './utils/audit';
import scriptsRouter from './routes/scripts';
import statsRouter from './routes/stats';
import authRouter, { ensureAdmin } from './routes/auth';
import webhookRouter from './routes/webhook';
import captchaRouter from './routes/captcha';
import debugRouter from './routes/debug';

// 扩展 Express Request 类型以支持 webhook 原始请求体
declare global {
    namespace Express {
        interface Request {
            rawBody?: string;
        }
    }
}

const app = express();
// 信任反向代理（Nginx、Caddy 等），使 req.ip 返回真实客户端 IP
app.set('trust proxy', TRUST_PROXY);

// 异步启动数据库
async function main() {
    // 启动前必须提供管理员凭据
    if (!ADMIN_USERNAME || !ADMIN_PASSWORD) {
        console.error('❌ 必须设置 ADMIN_USERNAME 和 ADMIN_PASSWORD 环境变量');
        console.error('   示例:');
        console.error('   ADMIN_USERNAME=admin ADMIN_PASSWORD=your_password npm start');
        console.error('   或在 .env 文件中添加:');
        console.error('   ADMIN_USERNAME=admin');
        console.error('   ADMIN_PASSWORD=your_password');
        process.exit(1);
    }

    // 初始化数据库
    await initDatabase();

    // 通过环境变量初始化管理员账号
    await ensureAdmin(ADMIN_USERNAME, ADMIN_PASSWORD);

    // 安全头部（helmet）
    app.use(
        helmet({
            crossOriginResourcePolicy: { policy: 'cross-origin' },
            contentSecurityPolicy: false, // 允许 Tailwind 的内联样式
        }),
    );

    // 限流（四级：无cookie < 访客 < 用户 < 管理员不限；各级独立计数器）
    const apiLimiter = rateLimit({
        windowMs: API_RATE_LIMIT_WINDOW_MS,
        skip: (req) => getRequestRole(req) === 'admin',
        max: (req) => {
            const role = getRequestRole(req);
            if (role === 'user') return API_RATE_LIMIT_USER_MAX;
            if (role === 'guest') return API_RATE_LIMIT_GUEST_MAX;
            return API_RATE_LIMIT_NO_COOKIE_MAX;
        },
        keyGenerator: (req) => {
            const role = getRequestRole(req);
            if (role === 'user') {
                // 用户按 userId 独立计数
                const token = req.cookies?.session_token;
                if (token) {
                    const payload = verifyToken(token);
                    if (payload && payload.userId !== null && payload.userId !== undefined) {
                        return `user:${payload.userId}`;
                    }
                }
            }
            if (role === 'guest') {
                // 访客按 token 值独立计数（每个访客 token 不同）
                const token = req.cookies?.session_token;
                if (token) return `guest:${token}`;
            }
            // 无 cookie 用户按 IP 计数（使用 express-rate-limit 的默认 IP 处理器）
            return ipKeyGenerator(req.ip || req.socket.remoteAddress || 'unknown');
        },
        standardHeaders: true,
        legacyHeaders: false,
        message: { error: '请求过于频繁，请稍后再试' },
        handler: (req, res) => {
            const role = getRequestRole(req);
            // 从 token 中提取用户信息
            let userId: number | null = null;
            let username: string | null = null;
            const token = req.cookies?.session_token;
            if (token) {
                const payload = verifyToken(token);
                if (payload) {
                    if (payload.userId !== null && payload.userId !== undefined) {
                        userId = payload.userId;
                    }
                    username = payload.username || null;
                }
            }
            const clientIp = req.ip || req.socket.remoteAddress || '';
            const who = username ? `${username}(userId=${userId})` : `[${role}]`;
            audit('rate_limit.exceeded', userId, `API 限流 ${req.method} ${req.path} ${who} ${clientIp}`, {
                role,
                ip: clientIp,
                username,
            });
            res.status(429).json({ error: '请求过于频繁，请稍后再试' });
        },
    });

    const loginLimiter = rateLimit({
        windowMs: LOGIN_RATE_LIMIT_WINDOW_MS,
        max: LOGIN_RATE_LIMIT_MAX,
        standardHeaders: true,
        legacyHeaders: false,
        message: { error: '登录尝试过于频繁，请 15 分钟后再试' },
    });

    // 跨域
    app.use(
        cors({
            origin: isProd ? CORS_ORIGIN : true,
            credentials: true,
        }),
    );

    // 捕获原始请求体用于 webhook 签名验证（必须在 JSON 解析之前）
    app.use(
        express.json({
            limit: '10mb',
            verify: (req: express.Request, _res: express.Response, buf: Buffer) => {
                req.rawBody = buf.toString('utf-8');
            },
        }),
    );
    app.use(express.urlencoded({ extended: true, limit: '10mb' }));
    app.use(cookieParser());

    // 自动签发访客 token（让无 cookie 的请求获得服务器签名身份，便于四级限流）
    app.use('/api', ensureGuestToken);

    // 应用限流器（webhook 和 captcha 排除在全局限流外，但各自有独立限流）
    const webhookLimiter = rateLimit({
        windowMs: WEBHOOK_RATE_LIMIT_WINDOW_MS,
        max: WEBHOOK_RATE_LIMIT_MAX,
        standardHeaders: true,
        legacyHeaders: false,
        message: { error: '请求过于频繁，请稍后再试' },
    });
    const captchaLimiter = rateLimit({
        windowMs: CAPTCHA_RATE_LIMIT_WINDOW_MS,
        max: CAPTCHA_RATE_LIMIT_MAX,
        standardHeaders: true,
        legacyHeaders: false,
        message: { error: '请求过于频繁，请稍后再试' },
    });
    app.use('/api/webhook', webhookLimiter, webhookRouter);
    app.use('/api/captcha', captchaLimiter, captchaRouter);
    app.use('/api', apiLimiter);
    app.use('/api/auth/login', loginLimiter);

    // API 路由
    app.use('/api/auth', authRouter);
    app.use('/api/scripts', scriptsRouter);
    app.use('/api/stats', statsRouter);

    // Debug API（仅在 DEBUG_ENABLED=true 时可用）
    if (DEBUG_ENABLED) {
        app.use('/api/debug', debugRouter);
        console.log('🔧 Debug API 已启用 (http://localhost:' + PORT + '/api/debug/)');
    }

    // 提供静态前端文件（来自 client/dist）
    const clientDistPath = path.join(__dirname, '..', '..', 'client', 'dist');
    if (fs.existsSync(clientDistPath)) {
        app.use(express.static(clientDistPath));

        // SPA 回退 — 所有非 API 路由返回 index.html
        app.get('*', (_req, res) => {
            if (!_req.path.startsWith('/api/')) {
                res.sendFile(path.join(clientDistPath, 'index.html'));
            } else {
                res.status(404).json({ error: 'API 端点不存在' });
            }
        });
    }

    // 启动服务器
    app.listen(PORT, () => {
        console.log(`🚀 ScriptShare 服务器已启动: http://localhost:${PORT}`);
    });
}

main().catch((err) => {
    console.error('服务器启动失败:', err);
    process.exit(1);
});

export default app;
