CREATE TABLE "audit_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"action" text NOT NULL,
	"userId" integer,
	"detail" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"createdAt" timestamp with time zone DEFAULT NOW()
);
--> statement-breakpoint
CREATE TABLE "cap_challenges" (
	"token" text PRIMARY KEY NOT NULL,
	"data" text NOT NULL,
	"expires" bigint NOT NULL,
	"createdAt" bigint
);
--> statement-breakpoint
CREATE TABLE "cap_tokens" (
	"key" text PRIMARY KEY NOT NULL,
	"expires" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "install_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"scriptId" integer NOT NULL,
	"ipHash" text,
	"userAgent" text,
	"browser" text DEFAULT '',
	"os" text DEFAULT '',
	"device" text DEFAULT '',
	"installedAt" timestamp with time zone DEFAULT NOW()
);
--> statement-breakpoint
CREATE TABLE "ratings" (
	"id" serial PRIMARY KEY NOT NULL,
	"scriptId" integer NOT NULL,
	"userId" integer NOT NULL,
	"score" integer NOT NULL,
	"comment" text DEFAULT '',
	"createdAt" timestamp with time zone DEFAULT NOW(),
	"updatedAt" timestamp with time zone DEFAULT NOW()
);
--> statement-breakpoint
CREATE TABLE "scripts" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"namespace" text DEFAULT '',
	"version" text DEFAULT '1.0.0' NOT NULL,
	"description" text DEFAULT '',
	"author" text DEFAULT '',
	"icon" text DEFAULT '',
	"icon64" text DEFAULT '',
	"grant" text DEFAULT '',
	"match" text DEFAULT '',
	"exclude" text DEFAULT '',
	"require" text DEFAULT '',
	"resource" text DEFAULT '',
	"connect" text DEFAULT '',
	"code" text NOT NULL,
	"filename" text DEFAULT '',
	"userId" integer,
	"installs" integer DEFAULT 0 NOT NULL,
	"updateChecks" integer DEFAULT 0 NOT NULL,
	"webhookSecret" text DEFAULT '',
	"githubRepo" text DEFAULT '',
	"githubPath" text DEFAULT '',
	"githubBranch" text DEFAULT 'main',
	"canaryVersion" text DEFAULT '',
	"canaryCode" text DEFAULT '',
	"canaryBranch" text DEFAULT 'canary',
	"readme" text DEFAULT '',
	"supportURL" text DEFAULT '',
	"i18n" jsonb DEFAULT '{}'::jsonb,
	"createdAt" timestamp with time zone DEFAULT NOW(),
	"updatedAt" timestamp with time zone DEFAULT NOW()
);
--> statement-breakpoint
CREATE TABLE "update_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"scriptId" integer NOT NULL,
	"oldVersion" text,
	"newVersion" text,
	"ipHash" text,
	"checkedAt" timestamp with time zone DEFAULT NOW()
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"username" text NOT NULL,
	"displayName" text DEFAULT '',
	"passwordHash" text NOT NULL,
	"avatarUrl" text DEFAULT '',
	"role" text DEFAULT 'user' NOT NULL,
	"tokenNonce" text DEFAULT '' NOT NULL,
	"createdAt" timestamp with time zone DEFAULT NOW(),
	"updatedAt" timestamp with time zone DEFAULT NOW(),
	CONSTRAINT "users_username_unique" UNIQUE("username")
);
--> statement-breakpoint
CREATE TABLE "webhook_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"scriptId" integer,
	"event" text NOT NULL,
	"action" text DEFAULT '' NOT NULL,
	"summary" text DEFAULT '',
	"detail" text DEFAULT '',
	"createdAt" timestamp with time zone DEFAULT NOW()
);
--> statement-breakpoint
ALTER TABLE "install_logs" ADD CONSTRAINT "install_logs_scriptId_scripts_id_fk" FOREIGN KEY ("scriptId") REFERENCES "public"."scripts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_scriptId_scripts_id_fk" FOREIGN KEY ("scriptId") REFERENCES "public"."scripts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scripts" ADD CONSTRAINT "scripts_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "update_logs" ADD CONSTRAINT "update_logs_scriptId_scripts_id_fk" FOREIGN KEY ("scriptId") REFERENCES "public"."scripts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_logs" ADD CONSTRAINT "webhook_logs_scriptId_scripts_id_fk" FOREIGN KEY ("scriptId") REFERENCES "public"."scripts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_audit_logs_action" ON "audit_logs" USING btree ("action");--> statement-breakpoint
CREATE INDEX "idx_audit_logs_user" ON "audit_logs" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "idx_audit_logs_created" ON "audit_logs" USING btree ("createdAt");--> statement-breakpoint
CREATE INDEX "idx_install_logs_script" ON "install_logs" USING btree ("scriptId");--> statement-breakpoint
CREATE INDEX "idx_install_logs_date" ON "install_logs" USING btree ("installedAt");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_ratings_script_user" ON "ratings" USING btree ("scriptId","userId");--> statement-breakpoint
CREATE INDEX "idx_ratings_script" ON "ratings" USING btree ("scriptId");--> statement-breakpoint
CREATE INDEX "idx_scripts_userId" ON "scripts" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "idx_scripts_name" ON "scripts" USING btree ("name");--> statement-breakpoint
CREATE INDEX "idx_scripts_updatedAt" ON "scripts" USING btree ("updatedAt");--> statement-breakpoint
CREATE INDEX "idx_scripts_author" ON "scripts" USING btree ("author");--> statement-breakpoint
CREATE INDEX "idx_update_logs_script" ON "update_logs" USING btree ("scriptId");--> statement-breakpoint
CREATE INDEX "idx_update_logs_date" ON "update_logs" USING btree ("checkedAt");--> statement-breakpoint
CREATE INDEX "idx_users_role" ON "users" USING btree ("role");