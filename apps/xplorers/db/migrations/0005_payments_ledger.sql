ALTER TABLE "app" ADD COLUMN "payment_config" jsonb;--> statement-breakpoint
ALTER TABLE "app" ADD COLUMN "integrations_config" jsonb;--> statement-breakpoint
ALTER TABLE "studio_sessions" ADD COLUMN "price_amount" numeric(10, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('awaiting_payment', 'pending_verification', 'paid', 'rejected', 'refunded');--> statement-breakpoint
CREATE TYPE "public"."ledger_direction" AS ENUM('debit', 'credit');--> statement-breakpoint
CREATE TYPE "public"."ledger_entry_type" AS ENUM('payment', 'refund', 'discount', 'adjustment');--> statement-breakpoint
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
);--> statement-breakpoint
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
);--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "payments_booking_idx" ON "payments" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "payments_user_idx" ON "payments" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_provider_event_idx" ON "payments" USING btree ("provider_event_id");--> statement-breakpoint
CREATE INDEX "ledger_user_created_idx" ON "ledger_entries" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "ledger_booking_idx" ON "ledger_entries" USING btree ("booking_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ledger_provider_event_idx" ON "ledger_entries" USING btree ("provider_event_id");--> statement-breakpoint
DROP INDEX IF EXISTS "bookings_occurrence_user_confirmed_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "bookings_occurrence_user_open_idx" ON "bookings" USING btree ("occurrence_id","user_id") WHERE status IN ('confirmed', 'pending');