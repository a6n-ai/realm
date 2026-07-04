CREATE TYPE "public"."business_event" AS ENUM('order_created', 'order_activated', 'order_completed', 'manual_adjustment');--> statement-breakpoint
CREATE TABLE "coin_rate" (
	"id" bigint PRIMARY KEY DEFAULT next_id() NOT NULL,
	"public_id" text NOT NULL,
	"created_at" bigint NOT NULL,
	"created_by" bigint,
	"currency" text NOT NULL,
	"value_per_coin" numeric(10, 4) NOT NULL,
	CONSTRAINT "coin_rate_public_id_unique" UNIQUE("public_id")
);
--> statement-breakpoint
CREATE TABLE "event_payout" (
	"id" bigint PRIMARY KEY DEFAULT next_id() NOT NULL,
	"public_id" text NOT NULL,
	"created_at" bigint NOT NULL,
	"created_by" bigint,
	"updated_at" bigint NOT NULL,
	"updated_by" bigint,
	"event_type" "business_event" NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"coins" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "event_payout_public_id_unique" UNIQUE("public_id"),
	CONSTRAINT "event_payout_event_type_unique" UNIQUE("event_type")
);
--> statement-breakpoint
CREATE TABLE "wallet_ledger" (
	"id" bigint PRIMARY KEY DEFAULT next_id() NOT NULL,
	"public_id" text NOT NULL,
	"created_at" bigint NOT NULL,
	"created_by" bigint,
	"user_id" bigint NOT NULL,
	"direction" "ledger_direction" NOT NULL,
	"event_type" "business_event",
	"source_type" text NOT NULL,
	"source_id" text NOT NULL,
	"coins" integer NOT NULL,
	"memo" text,
	"order_id" bigint,
	CONSTRAINT "wallet_ledger_public_id_unique" UNIQUE("public_id")
);
--> statement-breakpoint
ALTER TABLE "wallet_ledger" ADD CONSTRAINT "wallet_ledger_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_ledger" ADD CONSTRAINT "wallet_ledger_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "coin_rate_currency_created_idx" ON "coin_rate" USING btree ("currency","created_at");--> statement-breakpoint
CREATE INDEX "wallet_user_created_idx" ON "wallet_ledger" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "wallet_earn_idempotent_idx" ON "wallet_ledger" USING btree ("source_type","source_id","event_type");