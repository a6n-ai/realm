ALTER TABLE "studio_sessions" ADD COLUMN "weekdays" smallint[] DEFAULT '{}'::smallint[] NOT NULL;--> statement-breakpoint
ALTER TABLE "studio_sessions" ADD COLUMN "repeats_until" date;--> statement-breakpoint
CREATE UNIQUE INDEX "bookings_session_user_confirmed_idx" ON "bookings" USING btree ("session_id","user_id") WHERE status = 'confirmed';
