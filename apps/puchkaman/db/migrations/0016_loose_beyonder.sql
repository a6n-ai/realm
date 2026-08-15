CREATE TABLE "phone_verification" (
	"id" bigint PRIMARY KEY DEFAULT next_id() NOT NULL,
	"public_id" text NOT NULL,
	"app_id" bigint DEFAULT current_app_id() NOT NULL,
	"created_at" bigint NOT NULL,
	"created_by" bigint,
	"phone" text NOT NULL,
	"code_hash" text NOT NULL,
	"expires_at" bigint NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"consumed_at" bigint,
	CONSTRAINT "phone_verification_public_id_unique" UNIQUE("public_id")
);
--> statement-breakpoint
CREATE INDEX "phone_verification_phone_idx" ON "phone_verification" USING btree ("phone","expires_at");