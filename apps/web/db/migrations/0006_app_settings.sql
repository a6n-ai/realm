CREATE TABLE "app_settings" (
	"id" bigint PRIMARY KEY DEFAULT next_id() NOT NULL,
	"public_id" text NOT NULL,
	"created_at" bigint NOT NULL,
	"created_by" bigint,
	"updated_at" bigint NOT NULL,
	"updated_by" bigint,
	"timezone" text DEFAULT 'America/Toronto' NOT NULL,
	"cutoff_hour" integer DEFAULT 18 NOT NULL,
	CONSTRAINT "app_settings_public_id_unique" UNIQUE("public_id")
);
