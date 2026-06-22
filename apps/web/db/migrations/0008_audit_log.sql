CREATE TYPE "audit_operation" AS ENUM('create', 'update', 'delete');
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" bigint PRIMARY KEY DEFAULT next_id() NOT NULL,
	"public_id" text NOT NULL,
	"created_at" bigint NOT NULL,
	"created_by" bigint,
	"entity" text NOT NULL,
	"entity_public_id" text NOT NULL,
	"operation" "audit_operation" NOT NULL,
	"changes" jsonb,
	CONSTRAINT "audit_log_public_id_unique" UNIQUE("public_id")
);
