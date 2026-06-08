DROP INDEX "idx_scripts_name";--> statement-breakpoint
ALTER TABLE "scripts" ALTER COLUMN "grant" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "scripts" ALTER COLUMN "grant" SET DATA TYPE text[]
  USING (CASE WHEN "grant" = '' THEN '{}' ELSE string_to_array("grant", ', ') END);--> statement-breakpoint
ALTER TABLE "scripts" ALTER COLUMN "grant" SET DEFAULT '{}';--> statement-breakpoint
ALTER TABLE "scripts" ALTER COLUMN "match" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "scripts" ALTER COLUMN "match" SET DATA TYPE text[]
  USING (CASE WHEN "match" = '' THEN '{}' ELSE string_to_array("match", ', ') END);--> statement-breakpoint
ALTER TABLE "scripts" ALTER COLUMN "match" SET DEFAULT '{}';--> statement-breakpoint
ALTER TABLE "scripts" ALTER COLUMN "exclude" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "scripts" ALTER COLUMN "exclude" SET DATA TYPE text[]
  USING (CASE WHEN "exclude" = '' THEN '{}' ELSE string_to_array("exclude", ', ') END);--> statement-breakpoint
ALTER TABLE "scripts" ALTER COLUMN "exclude" SET DEFAULT '{}';--> statement-breakpoint
ALTER TABLE "scripts" ALTER COLUMN "require" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "scripts" ALTER COLUMN "require" SET DATA TYPE text[]
  USING (CASE WHEN "require" = '' THEN '{}' ELSE string_to_array("require", ', ') END);--> statement-breakpoint
ALTER TABLE "scripts" ALTER COLUMN "require" SET DEFAULT '{}';--> statement-breakpoint
ALTER TABLE "scripts" ALTER COLUMN "resource" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "scripts" ALTER COLUMN "resource" SET DATA TYPE text[]
  USING (CASE WHEN "resource" = '' THEN '{}' ELSE string_to_array("resource", ', ') END);--> statement-breakpoint
ALTER TABLE "scripts" ALTER COLUMN "resource" SET DEFAULT '{}';--> statement-breakpoint
ALTER TABLE "scripts" ALTER COLUMN "connect" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "scripts" ALTER COLUMN "connect" SET DATA TYPE text[]
  USING (CASE WHEN "connect" = '' THEN '{}' ELSE string_to_array("connect", ', ') END);--> statement-breakpoint
ALTER TABLE "scripts" ALTER COLUMN "connect" SET DEFAULT '{}';--> statement-breakpoint
ALTER TABLE "scripts" ADD COLUMN "viewCount" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "scripts" ADD COLUMN "deletedAt" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX "idx_scripts_name_unique" ON "scripts" USING btree ("name");--> statement-breakpoint
CREATE INDEX "idx_scripts_match_gin" ON "scripts" USING gin ("match" array_ops);--> statement-breakpoint
CREATE INDEX "idx_scripts_grant_gin" ON "scripts" USING gin ("grant" array_ops);--> statement-breakpoint
ALTER TABLE "scripts" DROP COLUMN "githubBranch";--> statement-breakpoint
ALTER TABLE "scripts" DROP COLUMN "canaryBranch";