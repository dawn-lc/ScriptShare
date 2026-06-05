/**
 * Debug API — only available when DEBUG_ENABLED=true.
 * Provides endpoints for seeding test data and resetting the database.
 */
import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { db } from '../db';
import { users, scripts } from '../db';
import { eq, count } from 'drizzle-orm';
import { sql } from 'drizzle-orm';

const router = Router();

// ── Local-only middleware ──
router.use((req: Request, res: Response, next) => {
    const ip = req.ip || req.socket.remoteAddress || '';
    const isLocal = ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1' || ip === 'localhost';
    if (!isLocal) {
        res.status(403).json({ error: 'Debug API 仅允许本地调用' });
        return;
    }
    next();
});

// ── Helpers ──
const pick = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
const randInt = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;

const names = [
    'Ad Blocker Pro', 'Video Download Helper', 'Page Dark Mode',
    'Auto Scroll', 'Link Cleaner', 'Image Zoom Plus',
    'Tab Manager', 'Form Filler', 'Password Revealer',
    'Cookie Editor', 'User Switcher', 'Style Customizer',
    'Script Runner', 'AJAX Debugger', 'DOM Inspector',
    'Color Picker', 'Font Changer', 'Layout Tester',
    'Cache Cleaner', 'Session Saver', 'Bookmark Organizer',
    'Search Enhancer', 'Dictionary Lookup', 'Translate Helper',
    'Price Tracker', 'Coupon Finder', 'Deal Alert',
    'News Aggregator', 'RSS Reader', 'Social Share',
    'Tweet Scheduler', 'Instagram Downloader', 'Reddit Enhancer',
    'YouTube Comments', 'Twitch Emotes', 'GitHub Helper',
    'Code Formatter', 'JSON Viewer', 'Regex Tester',
    'API Tester', 'WebSocket Monitor', 'Network Sniffer',
    'Performance Meter', 'Memory Usage', 'CPU Monitor',
    'Battery Saver', 'Screen Recorder', 'Screenshot Tool',
    'Tab Suspender', 'Focus Mode', 'Pomodoro Timer',
    'Todo List', 'Note Taking', 'Clipboard Manager',
    'Calculator', 'Unit Converter', 'Weather Widget',
    'Clock Widget', 'Calendar Helper', 'Countdown Timer',
    'iFrame Blocker', 'Pop-up Killer', 'Ad-block Helper',
    'Tracking Blocker', 'Privacy Guard', 'VPN Status',
    'Proxy Switcher', 'DNS Changer', 'IP Checker',
    'User-Agent Switcher', 'Geolocation Spoofer', 'Timezone Changer',
    'Language Detector', 'Text Counter', 'Case Converter',
    'Base64 Encoder', 'URL Encoder', 'Hash Generator',
    'Password Generator', 'QR Code Maker', 'Barcode Scanner',
];

const authors = [
    'dawn-lc', 'john_doe', 'script_master', 'code_wizard',
    'dev_guru', 'web_artist', 'byte_bender', 'pixel_pusher',
    'stack_surfer', 'loop_hero', 'null_ptr', 'async_await',
    'promise_king', 'callback_queen', 'regex_ranger',
    'css_ninja', 'flex_boxer', 'grid_master', 'hook_line',
    'state_less', 'effect_tive', 'redux_duck', 'saga_native',
];

const descriptions = [
    'Enhance your browsing experience with powerful tools',
    'A lightweight userscript for better web interaction',
    'Improve productivity and automate repetitive tasks',
    'Customize the look and feel of your favorite websites',
    'Add missing features to popular web applications',
    'Streamline your workflow with this handy utility',
    'Block annoying elements and focus on what matters',
    'Speed up your daily browsing routine',
    'Advanced tools for power users and developers',
    'Simple yet effective solution for common web issues',
    'Take control of your browser with this script',
    'Optimize your web experience with smart automation',
    'Essential toolkit for modern web browsing',
    'Boost your efficiency with intelligent features',
    'Your daily companion for better web navigation',
];

const namespaces = [
    'http://tampermonkey.net/', 'https://greasyfork.org/',
    'https://openuserjs.org/', 'http://localhost/',
];

const matchPatterns = [
    'https://*.example.com/*', 'https://*.github.com/*',
    'https://*.youtube.com/*', 'https://*.reddit.com/*',
    'https://*.twitter.com/*', 'https://*.stackoverflow.com/*',
    'https://*.medium.com/*', 'https://*.wikipedia.org/*',
];

const grantList = [
    'GM_getValue', 'GM_setValue', 'GM_deleteValue',
    'GM_listValues', 'GM_addValueChangeListener',
    'GM_notification', 'GM_setClipboard',
    'GM_xmlhttpRequest', 'GM_openInTab',
    'GM_registerMenuCommand', 'GM_addStyle', 'GM_log', 'GM_info',
];

function generateCode(name: string): string {
    return `// ==UserScript==\n// @name         ${name}\n// @namespace    ${pick(namespaces)}\n// @version      ${randInt(1, 5)}.${randInt(0, 20)}.${randInt(0, 999)}\n// @description  ${pick(descriptions)}\n// @author       ${pick(authors)}\n// @match        ${pick(matchPatterns)}\n// @grant        ${pick(grantList)}\n// ==/UserScript==\n\n(function() {\n    \'use strict\';\n    console.log(\'${name} loaded\');\n})();`;
}

// ── Seed endpoint ──

// POST /api/debug/seed - Insert 3000 test scripts
router.post('/seed', async (_req: Request, res: Response) => {
    // Count existing scripts
    const [{ count: existingCount }] = db.select({ count: count() }).from(scripts).all();
    if (existingCount > 0) {
        res.json({ message: `数据库中已有 ${existingCount} 条脚本，跳过填充。如需重新填充请先调用 /api/debug/reset` });
        return;
    }

    // Ensure admin user exists
    const [{ count: userCount }] = db.select({ count: count() }).from(users).all();
    let adminId = 1;
    if (userCount === 0) {
        const password = 'admin123';
        const salt = crypto.randomBytes(16).toString('hex');
        const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
        const [newUser] = await (db.insert(users).values({
            username: 'admin',
            displayName: 'Admin',
            passwordHash: `${salt}:${hash}`,
            role: 'admin',
        }).returning({ id: users.id }) as any);
        adminId = newUser.id;
    } else {
        const existing = db.select({ id: users.id }).from(users).where(eq(users.username, 'admin')).get();
        adminId = existing?.id || 1;
    }

    // Generate and insert scripts in batches
    const BATCH_SIZE = 100;
    const TOTAL = 3000;
    const now = Date.now();
    const DAY_MS = 86400000;

    for (let batch = 0; batch < TOTAL / BATCH_SIZE; batch++) {
        const batchRows: any[] = [];
        for (let i = 0; i < BATCH_SIZE; i++) {
            const idx = batch * BATCH_SIZE + i;
            const baseName = pick(names);
            const suffix = idx > 0 ? ` #${idx}` : '';
            const name = `${baseName}${suffix}`;

            const ageDays = Math.max(0, 90 - idx * 0.03);
            const createdAt = new Date(now - randInt(0, Math.ceil(ageDays)) * DAY_MS).toISOString();
            const updatedAgo = Math.max(0, ageDays * 0.3 - randInt(0, 5));
            const updatedAt = new Date(now - updatedAgo * DAY_MS).toISOString();

            const installs = randInt(0, 50000);
            const updateChecks = randInt(0, 200000);

            const numGrants = randInt(2, 4);
            const selectedGrants: string[] = [];
            const grantsCopy = [...grantList];
            for (let g = 0; g < numGrants && grantsCopy.length > 0; g++) {
                const gi = randInt(0, grantsCopy.length - 1);
                selectedGrants.push(grantsCopy[gi]);
                grantsCopy.splice(gi, 1);
            }

            batchRows.push({
                name,
                namespace: pick(namespaces),
                version: `${randInt(1, 5)}.${randInt(0, 20)}.${randInt(0, 999)}`,
                description: pick(descriptions),
                author: pick(authors),
                icon: '',
                icon64: '',
                grant: selectedGrants.join('\n'),
                match: pick(matchPatterns),
                exclude: '',
                require: '',
                resource: '',
                connect: '',
                code: generateCode(name),
                filename: `${name.toLowerCase().replace(/[^a-z0-9]/g, '_')}.user.js`,
                userId: adminId,
                installs,
                updateChecks,
                webhookSecret: null,
                githubRepo: null,
                githubPath: null,
                githubBranch: 'main',
                canaryVersion: null,
                canaryCode: null,
                canaryBranch: 'canary',
                readme: '',
                i18n: '{}',
                createdAt,
                updatedAt,
            });
        }

        db.insert(scripts).values(batchRows).run();
        console.log(`  [seed] 进度: ${(batch + 1) * BATCH_SIZE} / ${TOTAL}`);
    }

    res.json({ message: `成功插入 ${TOTAL} 条测试脚本`, adminUser: `admin / admin123` });
});

// POST /api/debug/reset - Reset all data (scripts, installs, updates, webhooks, etc.)
router.post('/reset', async (_req: Request, res: Response) => {
    // Delete in dependency order
    db.delete(scripts).run();
    db.delete(users).run();
    // Note: other tables have ON DELETE CASCADE or SET NULL, handled automatically
    res.json({ message: '数据库已重置' });
});

export default router;
