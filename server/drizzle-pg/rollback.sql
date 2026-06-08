-- 回滚部分成功的迁移
DROP INDEX IF EXISTS "idx_scripts_name_unique";
DROP INDEX IF EXISTS "idx_scripts_match_gin";
DROP INDEX IF EXISTS "idx_scripts_grant_gin";
ALTER TABLE "scripts" DROP COLUMN IF EXISTS "viewCount";
ALTER TABLE "scripts" DROP COLUMN IF EXISTS "deletedAt";
ALTER TABLE "scripts" ADD COLUMN IF NOT EXISTS "githubBranch" text DEFAULT 'main';
ALTER TABLE "scripts" ADD COLUMN IF NOT EXISTS "canaryBranch" text DEFAULT 'canary';
ALTER TABLE "scripts" ALTER COLUMN "grant" SET DEFAULT '';
ALTER TABLE "scripts" ALTER COLUMN "match" SET DEFAULT '';
ALTER TABLE "scripts" ALTER COLUMN "exclude" SET DEFAULT '';
ALTER TABLE "scripts" ALTER COLUMN "require" SET DEFAULT '';
ALTER TABLE "scripts" ALTER COLUMN "resource" SET DEFAULT '';
ALTER TABLE "scripts" ALTER COLUMN "connect" SET DEFAULT '';
CREATE INDEX IF NOT EXISTS "idx_scripts_name" ON "scripts" USING btree ("name");
