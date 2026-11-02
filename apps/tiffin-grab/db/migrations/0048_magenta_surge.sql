CREATE TABLE "otp_throttle" (
	"key" text PRIMARY KEY NOT NULL,
	"count" integer NOT NULL,
	"window_start" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rate_limit" (
	"id" text PRIMARY KEY DEFAULT (next_id())::text NOT NULL,
	"key" text NOT NULL,
	"count" integer NOT NULL,
	"last_request" bigint NOT NULL,
	CONSTRAINT "rate_limit_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "runtime_leases" (
	"key" text PRIMARY KEY NOT NULL,
	"holder" text,
	"expires_at" bigint,
	"value" text,
	"updated_at" bigint NOT NULL
);
