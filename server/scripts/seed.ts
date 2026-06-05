/**
 * Seed script — calls the debug API to populate test data.
 * Requires the server to be running with DEBUG_ENABLED=true.
 *
 * Usage:
 *   npx tsx test-utils/seed.ts [url]
 *   Default: http://localhost:3000
 */
const SERVER_URL = process.argv[2] || 'http://localhost:3000';

async function main() {
    console.log(`🔧 连接服务器: ${SERVER_URL}`);

    // 1. Reset database
    console.log('正在重置数据库...');
    const resetRes = await fetch(`${SERVER_URL}/api/debug/reset`, { method: 'POST' });
    if (!resetRes.ok) {
        const body = await resetRes.text();
        const err = JSON.parse(body || '{}') as any;
        throw new Error(`重置失败 (${resetRes.status}): ${err.error || resetRes.statusText}`);
    }
    console.log('✅', (await resetRes.text()));

    // 2. Seed 3000 scripts
    console.log('正在填充测试数据...');
    const seedRes = await fetch(`${SERVER_URL}/api/debug/seed`, { method: 'POST' });
    if (!seedRes.ok) {
        const body = await seedRes.text();
        const err = JSON.parse(body || '{}') as any;
        throw new Error(`填充失败 (${seedRes.status}): ${err.error || seedRes.statusText}`);
    }
    const result: any = await seedRes.json();
    console.log('✅', result.message);
    if (result.adminUser) {
        console.log('👤 管理员:', result.adminUser);
    }
}

main().catch((err: any) => {
    console.error('❌ Seed 失败:', err.message);
    process.exit(1);
});
