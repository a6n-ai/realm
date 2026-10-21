ALTER TYPE "public"."order_activity_type" ADD VALUE 'payment_failed';--> statement-breakpoint
ALTER TYPE "public"."order_activity_type" ADD VALUE 'payment_refunded';--> statement-breakpoint
ALTER TYPE "public"."order_activity_type" ADD VALUE 'payment_disputed';--> statement-breakpoint
ALTER TYPE "public"."payment_method" ADD VALUE 'stripe';--> statement-breakpoint
CREATE TABLE "stripe_events" (
	"event_id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"payment_id" bigint,
	"payload" jsonb NOT NULL,
	"received_at" bigint NOT NULL,
	"processed_at" bigint,
	"error" text
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "stripe_customer_id" text;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "provider_ref" text;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "provider_event_id" text;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "provider_checked_at" bigint;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "card_brand" text;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "card_last4" text;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "surcharge_amount" numeric(10, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "tax_calculation_id" text;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "tax_source" text;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "charge_attempt" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "expires_at" bigint;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "addon_request" jsonb;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD COLUMN "provider_event_id" text;--> statement-breakpoint
ALTER TABLE "stripe_events" ADD CONSTRAINT "stripe_events_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "stripe_events_received_idx" ON "stripe_events" USING btree ("received_at");--> statement-breakpoint
CREATE INDEX "stripe_events_payment_idx" ON "stripe_events" USING btree ("payment_id");--> statement-breakpoint
CREATE INDEX "payments_provider_ref_idx" ON "payments" USING btree ("provider_ref");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_provider_event_idx" ON "payments" USING btree ("provider_event_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ledger_provider_event_idx" ON "ledger_entries" USING btree ("provider_event_id");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_stripe_customer_id_unique" UNIQUE("stripe_customer_id");