CREATE TYPE "public"."payment_method" AS ENUM('simulated', 'cash', 'etransfer', 'manual');--> statement-breakpoint
CREATE TYPE "public"."coupon_kind" AS ENUM('percentage', 'fixed', 'free_delivery', 'first_order', 'rep_daily');--> statement-breakpoint
CREATE TYPE "public"."ledger_direction" AS ENUM('debit', 'credit');--> statement-breakpoint
CREATE TYPE "public"."ledger_entry_type" AS ENUM('payment', 'refund', 'discount', 'adjustment');--> statement-breakpoint
ALTER TYPE "public"."payment_status" ADD VALUE 'pending';--> statement-breakpoint
ALTER TYPE "public"."payment_status" ADD VALUE 'refunded';--> statement-breakpoint
CREATE TABLE "coupon_redemptions" (
	"id" bigint PRIMARY KEY DEFAULT next_id() NOT NULL,
	"public_id" text NOT NULL,
	"created_at" bigint NOT NULL,
	"created_by" bigint,
	"coupon_id" bigint NOT NULL,
	"user_id" bigint NOT NULL,
	"order_id" bigint NOT NULL,
	"redeemed_by" bigint,
	"amount_applied" numeric(10, 2) NOT NULL,
	"context" jsonb,
	CONSTRAINT "coupon_redemptions_public_id_unique" UNIQUE("public_id")
);
--> statement-breakpoint
CREATE TABLE "coupons" (
	"id" bigint PRIMARY KEY DEFAULT next_id() NOT NULL,
	"public_id" text NOT NULL,
	"created_at" bigint NOT NULL,
	"created_by" bigint,
	"updated_at" bigint NOT NULL,
	"updated_by" bigint,
	"code" text NOT NULL,
	"kind" "coupon_kind" NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"value_pct" numeric(5, 2),
	"value_amount" numeric(10, 2),
	"cap_pct" numeric(5, 2),
	"cap_amount" numeric(10, 2),
	"min_subtotal" numeric(10, 2),
	"max_redemptions" integer,
	"max_per_user" integer,
	"redemption_count" integer DEFAULT 0 NOT NULL,
	"stackable" boolean DEFAULT false NOT NULL,
	"plan_types" text[] DEFAULT '{}' NOT NULL,
	"starts_at" bigint,
	"expires_at" bigint,
	"owner_user_id" bigint,
	"ist_date" text,
	"active" boolean DEFAULT true NOT NULL,
	"config" jsonb,
	CONSTRAINT "coupons_public_id_unique" UNIQUE("public_id"),
	CONSTRAINT "coupons_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "ledger_entries" (
	"id" bigint PRIMARY KEY DEFAULT next_id() NOT NULL,
	"public_id" text NOT NULL,
	"created_at" bigint NOT NULL,
	"created_by" bigint,
	"user_id" bigint NOT NULL,
	"order_id" bigint,
	"payment_id" bigint,
	"direction" "ledger_direction" NOT NULL,
	"type" "ledger_entry_type" NOT NULL,
	"amount" numeric(10, 2) NOT NULL,
	"memo" text,
	CONSTRAINT "ledger_entries_public_id_unique" UNIQUE("public_id")
);
--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "method" "payment_method" DEFAULT 'simulated' NOT NULL;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "captured_at" bigint;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "note" text;--> statement-breakpoint
ALTER TABLE "app_settings" ADD COLUMN "discount_policy" jsonb;--> statement-breakpoint
ALTER TABLE "coupon_redemptions" ADD CONSTRAINT "coupon_redemptions_coupon_id_coupons_id_fk" FOREIGN KEY ("coupon_id") REFERENCES "public"."coupons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coupon_redemptions" ADD CONSTRAINT "coupon_redemptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coupon_redemptions" ADD CONSTRAINT "coupon_redemptions_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coupon_redemptions" ADD CONSTRAINT "coupon_redemptions_redeemed_by_users_id_fk" FOREIGN KEY ("redeemed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coupons" ADD CONSTRAINT "coupons_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "coupon_redemptions_coupon_idx" ON "coupon_redemptions" USING btree ("coupon_id");--> statement-breakpoint
CREATE INDEX "coupon_redemptions_user_idx" ON "coupon_redemptions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "coupon_redemptions_order_idx" ON "coupon_redemptions" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "coupons_kind_active_idx" ON "coupons" USING btree ("kind","active");--> statement-breakpoint
CREATE UNIQUE INDEX "coupons_rep_daily_unq" ON "coupons" USING btree ("owner_user_id","ist_date") WHERE "coupons"."kind" = 'rep_daily';--> statement-breakpoint
CREATE INDEX "ledger_user_created_idx" ON "ledger_entries" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "ledger_order_idx" ON "ledger_entries" USING btree ("order_id");