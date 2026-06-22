-- Drop legacy NextAuth tables (JWT+Credentials never wrote to them — zero data loss)
DROP TABLE IF EXISTS "verification_tokens";
--> statement-breakpoint
DROP TABLE IF EXISTS "sessions";
--> statement-breakpoint
DROP TABLE IF EXISTS "accounts";
--> statement-breakpoint

-- Alter users: convert email_verified from timestamptz to boolean
ALTER TABLE "users"
  ALTER COLUMN "email_verified" DROP DEFAULT,
  ALTER COLUMN "email_verified" TYPE boolean USING (email_verified IS NOT NULL),
  ALTER COLUMN "email_verified" SET NOT NULL,
  ALTER COLUMN "email_verified" SET DEFAULT false;
--> statement-breakpoint

-- Add phone_verified boolean
ALTER TABLE "users" ADD COLUMN "phone_verified" boolean NOT NULL DEFAULT false;
--> statement-breakpoint

-- Add Better Auth timestamp columns on users (Path B: separate from bigint epoch-ms cols)
ALTER TABLE "users" ADD COLUMN "bauth_created_at" timestamp NOT NULL DEFAULT now();
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "bauth_updated_at" timestamp NOT NULL DEFAULT now();
--> statement-breakpoint

-- Create Better Auth session table
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"public_id" text NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" bigint NOT NULL,
	"created_at" timestamp NOT NULL DEFAULT now(),
	"updated_at" timestamp NOT NULL DEFAULT now(),
	CONSTRAINT "session_public_id_unique" UNIQUE("public_id"),
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint

-- Create Better Auth account table
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"public_id" text NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" bigint NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp NOT NULL DEFAULT now(),
	"updated_at" timestamp NOT NULL DEFAULT now(),
	CONSTRAINT "account_public_id_unique" UNIQUE("public_id")
);
--> statement-breakpoint

-- Create Better Auth verification table
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"public_id" text NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp NOT NULL DEFAULT now(),
	"updated_at" timestamp NOT NULL DEFAULT now(),
	CONSTRAINT "verification_public_id_unique" UNIQUE("public_id")
);
--> statement-breakpoint

-- Foreign keys
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint

-- Indexes
CREATE INDEX "session_user_id_idx" ON "session" ("user_id");
--> statement-breakpoint
CREATE INDEX "account_user_id_idx" ON "account" ("user_id");
--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" ("identifier");
