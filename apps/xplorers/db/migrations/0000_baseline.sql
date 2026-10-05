-- Squashed baseline for xplorers. next_id()/current_app_id() are hand-written:
-- drizzle-kit generate does NOT emit them.
CREATE SEQUENCE IF NOT EXISTS "id_seq";--> statement-breakpoint
CREATE OR REPLACE FUNCTION next_id(OUT result bigint) RETURNS bigint LANGUAGE plpgsql AS $fn$
DECLARE our_epoch bigint := 1735689600000; seq_id bigint; now_millis bigint;
BEGIN
  SELECT nextval('id_seq') % 8388608 INTO seq_id;
  SELECT floor(extract(epoch FROM clock_timestamp()) * 1000) INTO now_millis;
  result := (now_millis - our_epoch) << 23;
  result := result | seq_id;
END;
$fn$;--> statement-breakpoint
CREATE OR REPLACE FUNCTION current_app_id() RETURNS bigint LANGUAGE sql STABLE AS $fn$ SELECT NULL::bigint $fn$;--> statement-breakpoint
CREATE TYPE "public"."locale" AS ENUM('en', 'fr');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('admin', 'member', 'user');--> statement-breakpoint
CREATE TYPE "public"."user_status" AS ENUM('active', 'inactive', 'suspended', 'deleted');--> statement-breakpoint
CREATE TYPE "public"."audit_operation" AS ENUM('create', 'update', 'delete', 'read', 'login', 'logout', 'login_failed');--> statement-breakpoint
CREATE TYPE "public"."file_resource_type" AS ENUM('static', 'secured');--> statement-breakpoint
CREATE TYPE "public"."file_system_node_type" AS ENUM('file', 'directory');--> statement-breakpoint
CREATE TYPE "public"."invitation_status" AS ENUM('pending', 'accepted', 'rejected', 'canceled');--> statement-breakpoint
CREATE TYPE "public"."booking_status" AS ENUM('pending', 'confirmed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."session_attendance" AS ENUM('stay', 'drop_off', 'either');--> statement-breakpoint
CREATE TYPE "public"."session_category" AS ENUM('kids', 'adults', 'birthday', 'school', 'drop_in', 'private', 'other');--> statement-breakpoint
CREATE TYPE "public"."ledger_direction" AS ENUM('debit', 'credit');--> statement-breakpoint
CREATE TYPE "public"."ledger_entry_type" AS ENUM('payment', 'refund', 'discount', 'adjustment');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('awaiting_payment', 'pending_verification', 'paid', 'rejected', 'refunded');--> statement-breakpoint
CREATE TABLE "app" (
	"id" bigint PRIMARY KEY DEFAULT next_id() NOT NULL,
	"public_id" text NOT NULL,
	"app_id" bigint DEFAULT current_app_id() NOT NULL,
	"created_at" bigint NOT NULL,
	"created_by" bigint,
	"updated_at" bigint NOT NULL,
	"updated_by" bigint,
	"timezone" text DEFAULT 'America/Toronto' NOT NULL,
	"currency" text DEFAULT 'CAD' NOT NULL,
	"payment_config" jsonb,
	"integrations_config" jsonb,
	CONSTRAINT "app_public_id_unique" UNIQUE("public_id")
);
--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY DEFAULT (next_id())::text NOT NULL,
	"public_id" text NOT NULL,
	"app_id" bigint DEFAULT current_app_id() NOT NULL,
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
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "account_public_id_unique" UNIQUE("public_id")
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY DEFAULT (next_id())::text NOT NULL,
	"public_id" text NOT NULL,
	"app_id" bigint DEFAULT current_app_id() NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"impersonated_by" text,
	"active_organization_id" text,
	"user_id" bigint NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "session_public_id_unique" UNIQUE("public_id"),
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" bigint PRIMARY KEY DEFAULT next_id() NOT NULL,
	"public_id" text NOT NULL,
	"app_id" bigint DEFAULT current_app_id() NOT NULL,
	"created_at" bigint NOT NULL,
	"created_by" bigint,
	"updated_at" bigint NOT NULL,
	"updated_by" bigint,
	"name" text,
	"email" text,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"locale" "locale" DEFAULT 'en' NOT NULL,
	"phone" text,
	"phone_verified" boolean DEFAULT false NOT NULL,
	"role" "user_role" DEFAULT 'user' NOT NULL,
	"platform_role" text,
	"status" "user_status" DEFAULT 'active' NOT NULL,
	"password_set" boolean DEFAULT false NOT NULL,
	"banned" boolean DEFAULT false,
	"ban_reason" text,
	"ban_expires" timestamp,
	"bauth_created_at" timestamp DEFAULT now() NOT NULL,
	"bauth_updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_public_id_unique" UNIQUE("public_id")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY DEFAULT (next_id())::text NOT NULL,
	"public_id" text NOT NULL,
	"app_id" bigint DEFAULT current_app_id() NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "verification_public_id_unique" UNIQUE("public_id")
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" bigint PRIMARY KEY DEFAULT next_id() NOT NULL,
	"public_id" text NOT NULL,
	"app_id" bigint DEFAULT current_app_id() NOT NULL,
	"created_at" bigint NOT NULL,
	"created_by" bigint,
	"entity" text NOT NULL,
	"entity_public_id" text NOT NULL,
	"operation" "audit_operation" NOT NULL,
	"changes" jsonb,
	CONSTRAINT "audit_log_public_id_unique" UNIQUE("public_id")
);
--> statement-breakpoint
CREATE TABLE "files_file_system" (
	"id" bigint PRIMARY KEY DEFAULT next_id() NOT NULL,
	"public_id" text NOT NULL,
	"app_id" bigint DEFAULT current_app_id() NOT NULL,
	"created_at" bigint NOT NULL,
	"created_by" bigint,
	"updated_at" bigint NOT NULL,
	"updated_by" bigint,
	"resource_type" "file_resource_type" DEFAULT 'static' NOT NULL,
	"name" text NOT NULL,
	"file_type" "file_system_node_type" DEFAULT 'file' NOT NULL,
	"size" bigint,
	"parent_id" bigint,
	"path" text DEFAULT '' NOT NULL,
	CONSTRAINT "files_file_system_public_id_unique" UNIQUE("public_id")
);
--> statement-breakpoint
CREATE TABLE "invitation" (
	"id" text PRIMARY KEY DEFAULT (next_id())::text NOT NULL,
	"organization_id" text NOT NULL,
	"email" text NOT NULL,
	"role" text,
	"status" "invitation_status" DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"inviter_id" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "member" (
	"id" text PRIMARY KEY DEFAULT (next_id())::text NOT NULL,
	"organization_id" text NOT NULL,
	"user_id" bigint NOT NULL,
	"role" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organization" (
	"id" text PRIMARY KEY DEFAULT (next_id())::text NOT NULL,
	"name" text NOT NULL,
	"slug" text,
	"logo" text,
	"metadata" text,
	"client_code" text NOT NULL,
	"parent_organization_id" text,
	"region" text,
	"city" text,
	"address" text,
	"timezone" text,
	"currency" text,
	"is_default_location" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "organization_slug_unique" UNIQUE("slug")
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
	"occurrence_id" bigint NOT NULL,
	"user_id" bigint NOT NULL,
	"seats" integer DEFAULT 1 NOT NULL,
	"status" "booking_status" DEFAULT 'confirmed' NOT NULL,
	CONSTRAINT "bookings_public_id_unique" UNIQUE("public_id")
);
--> statement-breakpoint
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
);
--> statement-breakpoint
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
	"price_amount" numeric(10, 2) DEFAULT '0' NOT NULL,
	"location" text,
	"attendance_mode" "session_attendance" DEFAULT 'either' NOT NULL,
	"published" boolean DEFAULT false NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"photos" text[] DEFAULT '{}'::text[] NOT NULL,
	"weekdays" smallint[] DEFAULT '{}'::smallint[] NOT NULL,
	"repeats_until" date,
	CONSTRAINT "studio_sessions_public_id_unique" UNIQUE("public_id")
);
--> statement-breakpoint
CREATE TABLE "ledger_entries" (
	"id" bigint PRIMARY KEY DEFAULT next_id() NOT NULL,
	"public_id" text NOT NULL,
	"app_id" bigint DEFAULT current_app_id() NOT NULL,
	"created_at" bigint NOT NULL,
	"created_by" bigint,
	"updated_at" bigint NOT NULL,
	"updated_by" bigint,
	"user_id" bigint NOT NULL,
	"booking_id" bigint,
	"payment_id" bigint,
	"direction" "ledger_direction" NOT NULL,
	"type" "ledger_entry_type" NOT NULL,
	"amount" numeric(10, 2) NOT NULL,
	"currency" text NOT NULL,
	"memo" text,
	"provider_event_id" text,
	CONSTRAINT "ledger_entries_public_id_unique" UNIQUE("public_id")
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" bigint PRIMARY KEY DEFAULT next_id() NOT NULL,
	"public_id" text NOT NULL,
	"app_id" bigint DEFAULT current_app_id() NOT NULL,
	"created_at" bigint NOT NULL,
	"created_by" bigint,
	"updated_at" bigint NOT NULL,
	"updated_by" bigint,
	"booking_id" bigint NOT NULL,
	"user_id" bigint NOT NULL,
	"status" "payment_status" DEFAULT 'awaiting_payment' NOT NULL,
	"method" text NOT NULL,
	"amount" numeric(10, 2) NOT NULL,
	"currency" text NOT NULL,
	"reference" text,
	"provider_event_id" text,
	"claimed_at" bigint,
	"captured_at" bigint,
	"note" text,
	CONSTRAINT "payments_public_id_unique" UNIQUE("public_id")
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "files_file_system" ADD CONSTRAINT "files_file_system_parent_id_files_file_system_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."files_file_system"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_inviter_id_users_id_fk" FOREIGN KEY ("inviter_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member" ADD CONSTRAINT "member_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member" ADD CONSTRAINT "member_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization" ADD CONSTRAINT "organization_parent_organization_id_organization_id_fk" FOREIGN KEY ("parent_organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_session_id_studio_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."studio_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_occurrence_id_studio_session_occurrences_id_fk" FOREIGN KEY ("occurrence_id") REFERENCES "public"."studio_session_occurrences"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studio_session_occurrences" ADD CONSTRAINT "studio_session_occurrences_session_id_studio_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."studio_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "session_user_id_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_unique" ON "users" USING btree ("email") WHERE "users"."email" is not null;--> statement-breakpoint
CREATE INDEX "users_created_idx" ON "users" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_fs_rtype_ftype_parent" ON "files_file_system" USING btree ("resource_type","file_type","parent_id");--> statement-breakpoint
CREATE INDEX "idx_fs_rtype_ftype" ON "files_file_system" USING btree ("resource_type","file_type");--> statement-breakpoint
CREATE INDEX "idx_fs_path" ON "files_file_system" USING btree ("path");--> statement-breakpoint
CREATE INDEX "invitation_org_idx" ON "invitation" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "invitation_email_idx" ON "invitation" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "member_org_user_unique" ON "member" USING btree ("organization_id","user_id");--> statement-breakpoint
CREATE INDEX "member_user_idx" ON "member" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "organization_client_code_unique" ON "organization" USING btree ("client_code");--> statement-breakpoint
CREATE INDEX "organization_parent_idx" ON "organization" USING btree ("parent_organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "organization_default_location_unique" ON "organization" USING btree ("is_default_location") WHERE is_default_location = true;--> statement-breakpoint
CREATE INDEX "bookings_session_status_idx" ON "bookings" USING btree ("session_id","status");--> statement-breakpoint
CREATE INDEX "bookings_occurrence_status_idx" ON "bookings" USING btree ("occurrence_id","status");--> statement-breakpoint
CREATE INDEX "bookings_user_idx" ON "bookings" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "bookings_occurrence_user_open_idx" ON "bookings" USING btree ("occurrence_id","user_id") WHERE "bookings"."status" IN ('confirmed', 'pending');--> statement-breakpoint
CREATE UNIQUE INDEX "studio_session_occurrences_session_day_idx" ON "studio_session_occurrences" USING btree ("session_id","occurs_on");--> statement-breakpoint
CREATE INDEX "studio_sessions_starts_idx" ON "studio_sessions" USING btree ("starts_at");--> statement-breakpoint
CREATE INDEX "studio_sessions_published_starts_idx" ON "studio_sessions" USING btree ("published","starts_at");--> statement-breakpoint
CREATE INDEX "ledger_user_created_idx" ON "ledger_entries" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "ledger_booking_idx" ON "ledger_entries" USING btree ("booking_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ledger_provider_event_idx" ON "ledger_entries" USING btree ("provider_event_id");--> statement-breakpoint
CREATE INDEX "payments_booking_idx" ON "payments" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "payments_user_idx" ON "payments" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_provider_event_idx" ON "payments" USING btree ("provider_event_id");--> statement-breakpoint
CREATE OR REPLACE FUNCTION current_app_id() RETURNS bigint LANGUAGE sql STABLE AS $fn$ SELECT id FROM app ORDER BY id LIMIT 1 $fn$;--> statement-breakpoint
DO $do$
DECLARE t text;
BEGIN
  FOR t IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND EXISTS (
        SELECT 1 FROM pg_attribute a
        WHERE a.attrelid = c.oid AND a.attname = 'app_id' AND a.attnum > 0 AND NOT a.attisdropped
      )
    ORDER BY c.relname
  LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_' || t || '_app') THEN
      EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (app_id) REFERENCES app(id)', t, 'fk_' || t || '_app');
    END IF;
  END LOOP;
END
$do$;
