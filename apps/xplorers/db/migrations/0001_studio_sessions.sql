CREATE TYPE "public"."session_category" AS ENUM('kids', 'adults', 'birthday', 'school', 'drop_in', 'private', 'other');--> statement-breakpoint
CREATE TYPE "public"."session_attendance" AS ENUM('stay', 'drop_off', 'either');--> statement-breakpoint
CREATE TYPE "public"."booking_status" AS ENUM('pending', 'confirmed', 'cancelled');--> statement-breakpoint
CREATE TABLE "studio_sessions" (
	"id" bigint PRIMARY KEY DEFAULT next_id() NOT NULL,
	"public_id" text NOT NULL,
	"app_id" bigint DEFAULT current_app_id() NOT NULL,
	"created_at" bigint NOT NULL,
	"created_by" bigint,
	"updated_at" bigint NOT NULL,
	"updated_by" bigint,
	"title" text NOT NULL,
	"category" "session_category" NOT NULL,
	"description" text,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"audience" text,
	"capacity" integer NOT NULL,
	"price_display" text,
	"location" text,
	"attendance_mode" "session_attendance" DEFAULT 'either' NOT NULL,
	"published" boolean DEFAULT false NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	CONSTRAINT "studio_sessions_public_id_unique" UNIQUE("public_id")
);
--> statement-breakpoint
CREATE TABLE "bookings" (
	"id" bigint PRIMARY KEY DEFAULT next_id() NOT NULL,
	"public_id" text NOT NULL,
	"app_id" bigint DEFAULT current_app_id() NOT NULL,
	"created_at" bigint NOT NULL,
	"created_by" bigint,
	"updated_at" bigint NOT NULL,
	"updated_by" bigint,
	"session_id" bigint NOT NULL,
	"user_id" bigint NOT NULL,
	"seats" integer DEFAULT 1 NOT NULL,
	"status" "booking_status" DEFAULT 'confirmed' NOT NULL,
	CONSTRAINT "bookings_public_id_unique" UNIQUE("public_id")
);
--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_session_id_studio_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."studio_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "studio_sessions_starts_idx" ON "studio_sessions" USING btree ("starts_at");--> statement-breakpoint
CREATE INDEX "studio_sessions_published_starts_idx" ON "studio_sessions" USING btree ("published","starts_at");--> statement-breakpoint
CREATE INDEX "bookings_session_status_idx" ON "bookings" USING btree ("session_id","status");--> statement-breakpoint
CREATE INDEX "bookings_user_idx" ON "bookings" USING btree ("user_id");
