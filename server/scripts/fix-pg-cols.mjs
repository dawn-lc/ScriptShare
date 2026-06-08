import pg from 'pg';
const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://dawn:990930linCHEN!@10.0.0.165:5432/postgres'
});
try {
    await pool.query('ALTER TABLE cap_tokens ALTER COLUMN expires TYPE bigint');
    await pool.query('ALTER TABLE cap_challenges ALTER COLUMN expires TYPE bigint');
    await pool.query('ALTER TABLE cap_challenges ALTER COLUMN "createdAt" TYPE bigint');
    console.log('OK: columns altered');
} catch (e) {
    console.error('Error:', e.message);
} finally {
    await pool.end();
}
