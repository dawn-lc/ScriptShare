/// <reference types="node" />
import { defineConfig } from 'drizzle-kit';

const dialect = (process.env.DB_DIALECT || 'sqlite').toLowerCase();

export default defineConfig({
    schema: './src/db/schema.ts',
    out: dialect === 'postgresql' ? './drizzle-pg' : './drizzle',
    dialect: dialect as 'sqlite' | 'postgresql',
    dbCredentials:
        dialect === 'postgresql'
            ? {
                url: process.env.DATABASE_URL || 'postgresql://localhost:5432/scriptshare',
            }
            : {
                url: './data/scriptshare.db',
            },
});
