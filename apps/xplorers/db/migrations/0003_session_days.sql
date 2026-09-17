CREATE TABLE "studio_session_occurrences" (
	"id" bigint PRIMARY KEY DEFAULT next_id() NOT NULL,
	"public_id" text NOT NULL,
	"app_id" bigint DEFAULT current_app_id() NOT NULL,
	"created_at" bigint NOT NULL,
	"created_by" bigint,
	"updated_at" bigint NOT NULL,
	"updated_by" bigint,
	"session_id" bigint NOT NULL,
	"occurs_on" date NOT NULL,
	CONSTRAINT "studio_session_occurrences_public_id_unique" UNIQUE("public_id")
);--> statement-breakpoint
ALTER TABLE "studio_session_occurrences" ADD CONSTRAINT "studio_session_occurrences_session_id_studio_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."studio_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "studio_session_occurrences_session_day_idx" ON "studio_session_occurrences" USING btree ("session_id","occurs_on");--> statement-breakpoint
INSERT INTO "studio_session_occurrences" (
	"id",
	"public_id",
	"app_id",
	"created_at",
	"created_by",
	"updated_at",
	"updated_by",
	"session_id",
	"occurs_on"
)
SELECT
	next_id(),
	'occ_' || substr(md5(random()::text || s."id"::text), 1, 12),
	s."app_id",
	s."created_at",
	s."created_by",
	s."updated_at",
	s."updated_by",
	s."id",
	((s."starts_at" AT TIME ZONE COALESCE((SELECT "timezone" FROM "app" LIMIT 1), 'Asia/Singapore')))::date
FROM "studio_sessions" s;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "occurrence_id" bigint;--> statement-breakpoint
UPDATE "bookings" AS b SET "occurrence_id" = o."id"
FROM "studio_session_occurrences" AS o
WHERE o."session_id" = b."session_id";--> statement-breakpoint
ALTER TABLE "bookings" ALTER COLUMN "occurrence_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_occurrence_id_studio_session_occurrences_id_fk" FOREIGN KEY ("occurrence_id") REFERENCES "public"."studio_session_occurrences"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bookings_occurrence_status_idx" ON "bookings" USING btree ("occurrence_id","status");--> statement-breakpoint
DROP INDEX "bookings_session_user_confirmed_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "bookings_occurrence_user_confirmed_idx" ON "bookings" USING btree ("occurrence_id","user_id") WHERE status = 'confirmed';
