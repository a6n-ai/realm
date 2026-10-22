CREATE TYPE "public"."referral_status" AS ENUM('joined', 'ordered', 'rewarded', 'reversed');--> statement-breakpoint
ALTER TYPE "public"."app_event" ADD VALUE 'referral_referrer';--> statement-breakpoint
ALTER TYPE "public"."app_event" ADD VALUE 'referral_friend';--> statement-breakpoint
CREATE TABLE "referrals" (
	"id" bigint PRIMARY KEY DEFAULT next_id() NOT NULL,
	"public_id" text NOT NULL,
	"app_id" bigint DEFAULT current_app_id() NOT NULL,
	"created_at" bigint NOT NULL,
	"created_by" bigint,
	"updated_at" bigint NOT NULL,
	"updated_by" bigint,
	"referrer_user_id" bigint NOT NULL,
	"referred_user_id" bigint NOT NULL,
	"status" "referral_status" DEFAULT 'joined' NOT NULL,
	"qualifying_order_id" bigint,
	"referrer_coins" integer DEFAULT 0 NOT NULL,
	"friend_coins" integer DEFAULT 0 NOT NULL,
	"skip_reason" text,
	CONSTRAINT "referrals_public_id_unique" UNIQUE("public_id"),
	CONSTRAINT "referrals_referred_user_id_unique" UNIQUE("referred_user_id")
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "referral_code" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "referred_by_user_id" bigint;--> statement-breakpoint
ALTER TABLE "app" ADD COLUMN "referral_mode" text DEFAULT 'flat' NOT NULL;--> statement-breakpoint
ALTER TABLE "app" ADD COLUMN "referral_referrer_value" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "app" ADD COLUMN "referral_friend_value" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "app" ADD COLUMN "referral_max_per_referrer" integer;--> statement-breakpoint
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_referrer_user_id_users_id_fk" FOREIGN KEY ("referrer_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_referred_user_id_users_id_fk" FOREIGN KEY ("referred_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_qualifying_order_id_orders_id_fk" FOREIGN KEY ("qualifying_order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "referrals_referrer_idx" ON "referrals" USING btree ("referrer_user_id");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_referred_by_user_id_users_id_fk" FOREIGN KEY ("referred_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_referral_code_unique" UNIQUE("referral_code");