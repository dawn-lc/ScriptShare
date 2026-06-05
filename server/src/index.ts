import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { initDatabase } from './db';
import { PORT, NODE_ENV, isProd, TRUST_PROXY, CORS_ORIGIN, DEBUG_ENABLED } from './config';
import scriptsRouter from './routes/scripts';
import statsRouter from './routes/stats';
import authRouter from './routes/auth';
import webhookRouter from './routes/webhook';
import capRouter from './routes/cap';
import debugRouter from './routes/debug';

const app = express();
// Trust reverse proxy (Nginx, Caddy, etc.) so req.ip returns the real client IP
app.set('trust proxy', TRUST_PROXY);

// Async startup: sql.js needs to load WASM asynchronously
async function main() {
    // Initialize database
    await initDatabase();

    // Security headers (helmet)
    app.use(
        helmet({
            crossOriginResourcePolicy: { policy: 'cross-origin' },
            contentSecurityPolicy: false, // Allow inline styles for Tailwind
        }),
    );

    // Rate limiting
    const apiLimiter = rateLimit({
        windowMs: 15 * 60 * 1000, // 15 minutes
        max: 200,
        standardHeaders: true,
        legacyHeaders: false,
        message: { error: '请求过于频繁，请稍后再试' },
    });

    const loginLimiter = rateLimit({
        windowMs: 15 * 60 * 1000,
        max: 10, // 10 attempts per 15 min
        standardHeaders: true,
        legacyHeaders: false,
        message: { error: '登录尝试过于频繁，请 15 分钟后再试' },
    });

    // CORS
    const isProd = process.env.NODE_ENV === 'production';
    app.use(
        cors({
            origin: isProd ? process.env.CORS_ORIGIN || 'http://localhost:3000' : true,
            credentials: true,
        }),
    );

    // Capture raw body for webhook signature verification (must be before JSON parsing)
    app.use(
        express.json({
            limit: '10mb',
            verify: (req: any, _res: any, buf: Buffer) => {
                req.rawBody = buf.toString('utf-8');
            },
        }),
    );
    app.use(express.urlencoded({ extended: true, limit: '10mb' }));
    app.use(cookieParser());

    // Apply rate limiters (webhook and cap excluded from global limiter, but have their own)
    const webhookLimiter = rateLimit({
        windowMs: 60000, // 1 minute
        max: 60,
        standardHeaders: true,
        legacyHeaders: false,
        message: { error: '请求过于频繁，请稍后再试' },
    });
    const capLimiter = rateLimit({
        windowMs: 60000,
        max: 30,
        standardHeaders: true,
        legacyHeaders: false,
        message: { error: '请求过于频繁，请稍后再试' },
    });
    app.use('/api/webhook', webhookLimiter, webhookRouter);
    app.use('/api/cap', capLimiter, capRouter);
    app.use('/api', apiLimiter);
    app.use('/api/auth/login', loginLimiter);

    // API routes
    app.use('/api/auth', authRouter);
    app.use('/api/scripts', scriptsRouter);
    app.use('/api/stats', statsRouter);

    // Debug API (only available when DEBUG_ENABLED=true)
    if (DEBUG_ENABLED) {
        app.use('/api/debug', debugRouter);
        console.log('🔧 Debug API 已启用 (http://localhost:' + PORT + '/api/debug/)');
    }

    // Serve static frontend files (from client/dist)
    const clientDistPath = path.join(__dirname, '..', '..', 'client', 'dist');
    if (fs.existsSync(clientDistPath)) {
        app.use(express.static(clientDistPath));

        // SPA fallback - serve index.html for all non-API routes
        app.get('*', (_req, res) => {
            if (!_req.path.startsWith('/api/')) {
                res.sendFile(path.join(clientDistPath, 'index.html'));
            } else {
                res.status(404).json({ error: 'API 端点不存在' });
            }
        });
    }

    // Start server
    app.listen(PORT, () => {
        console.log(`🚀 ScriptShare 服务器已启动: http://localhost:${PORT}`);
    });
}

main().catch((err) => {
    console.error('服务器启动失败:', err);
    process.exit(1);
});

export default app;
