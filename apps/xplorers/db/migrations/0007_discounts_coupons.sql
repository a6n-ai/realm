CREATE TYPE "public"."discount_scope" AS ENUM('all', 'category', 'session');--> statement-breakpoint
CREATE TABLE "coupon_redemptions" (
	"id" bigint PRIMARY KEY DEFAULT next_id() NOT NULL,
	"public_id" text NOT NULL,
	"app_id" bigint DEFAULT current_app_id() NOT NULL,
	"created_at" bigint NOT NULL,
	"created_by" bigint,
	"updated_at" bigint NOT NULL,
	"updated_by" bigint,
	"coupon_id" bigint NOT NULL,
	"booking_id" bigint NOT NULL,
	"user_id" bigint NOT NULL,
	"amount_applied" numeric(10, 2) NOT NULL,
	CONSTRAINT "coupon_redemptions_public_id_unique" UNIQUE("public_id")
);--> statement-breakpoint
CREATE TABLE "coupons" (
	"id" bigint PRIMARY KEY DEFAULT next_id() NOT NULL,
	"public_id" text NOT NULL,
	"app_id" bigint DEFAULT current_app_id() NOT NULL,
	"created_at" bigint NOT NULL,
	"created_by" bigint,
	"updated_at" bigint NOT NULL,
	"updated_by" bigint,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"percent_off" numeric(5, 2),
	"amount_off" numeric(10, 2),
	"min_subtotal" numeric(10, 2),
	"max_redemptions" integer,
	"max_per_user" integer,
	"redemption_count" integer DEFAULT 0 NOT NULL,
	"allowed_payment_methods" text[] DEFAULT '{}'::text[] NOT NULL,
	"starts_at" bigint,
	"expires_at" bigint,
	"stackable" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "coupons_public_id_unique" UNIQUE("public_id"),
	CONSTRAINT "coupons_one_value" CHECK (("coupons"."percent_off" IS NULL) <> ("coupons"."amount_off" IS NULL))
);--> statement-breakpoint
CREATE TABLE "discounts" (
	"id" bigint PRIMARY KEY DEFAULT next_id() NOT NULL,
	"public_id" text NOT NULL,
	"app_id" bigint DEFAULT current_app_id() NOT NULL,
	"created_at" bigint NOT NULL,
	"created_by" bigint,
	"updated_at" bigint NOT NULL,
	"updated_by" bigint,
	"name" text NOT NULL,
	"scope" "discount_scope" DEFAULT 'all' NOT NULL,
	"category" "session_category",
	"session_id" bigint,
	"percent_off" numeric(5, 2),
	"amount_off" numeric(10, 2),
	"min_subtotal" numeric(10, 2),
	"starts_at" bigint,
	"ends_at" bigint,
	"stackable" boolean DEFAULT true NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "discounts_public_id_unique" UNIQUE("public_id"),
	CONSTRAINT "discounts_one_value" CHECK (("discounts"."percent_off" IS NULL) <> ("discounts"."amount_off" IS NULL)),
	CONSTRAINT "discounts_scope_target" CHECK (("discounts"."scope" = 'all' AND "discounts"."category" IS NULL AND "discounts"."session_id" IS NULL)
        OR ("discounts"."scope" = 'category' AND "discounts"."category" IS NOT NULL AND "discounts"."session_id" IS NULL)
        OR ("discounts"."scope" = 'session' AND "discounts"."session_id" IS NOT NULL AND "discounts"."category" IS NULL))
);--> statement-breakpoint
ALTER TABLE "app" ADD COLUMN "discount_settings" jsonb;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "pricing" jsonb;--> statement-breakpoint
ALTER TABLE "coupon_redemptions" ADD CONSTRAINT "coupon_redemptions_coupon_id_coupons_id_fk" FOREIGN KEY ("coupon_id") REFERENCES "public"."coupons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coupon_redemptions" ADD CONSTRAINT "coupon_redemptions_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coupon_redemptions" ADD CONSTRAINT "coupon_redemptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discounts" ADD CONSTRAINT "discounts_session_id_studio_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."studio_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "coupon_redemptions_coupon_booking_idx" ON "coupon_redemptions" USING btree ("coupon_id","booking_id");--> statement-breakpoint
CREATE INDEX "coupon_redemptions_coupon_user_idx" ON "coupon_redemptions" USING btree ("coupon_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "coupons_code_idx" ON "coupons" USING btree ("code");--> statement-breakpoint
CREATE INDEX "discounts_active_idx" ON "discounts" USING btree ("active");
