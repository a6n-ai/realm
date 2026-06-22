ALTER TYPE "order_status" ADD VALUE IF NOT EXISTS 'paused';
--> statement-breakpoint
CREATE TYPE "order_activity_type" AS ENUM('created', 'status_change', 'paused', 'resumed', 'cancelled', 'activated', 'meal_pick', 'note');
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "paused_from" date;
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "paused_until" date;
--> statement-breakpoint
CREATE TABLE "order_activities" (
	"id" bigint PRIMARY KEY DEFAULT next_id() NOT NULL,
	"public_id" text NOT NULL,
	"created_at" bigint NOT NULL,
	"created_by" bigint,
	"order_id" bigint NOT NULL,
	"type" "order_activity_type" NOT NULL,
	"note" text,
	"from_status" "order_status",
	"to_status" "order_status",
	CONSTRAINT "order_activities_public_id_unique" UNIQUE("public_id")
);
--> statement-breakpoint
ALTER TABLE "order_activities" ADD CONSTRAINT "order_activities_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;
