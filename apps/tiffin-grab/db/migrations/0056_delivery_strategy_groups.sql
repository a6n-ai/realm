CREATE TABLE "delivery_strategy_groups" (
	"id" bigint PRIMARY KEY DEFAULT next_id() NOT NULL,
	"public_id" text NOT NULL,
	"app_id" bigint DEFAULT current_app_id() NOT NULL,
	"created_at" bigint NOT NULL,
	"created_by" bigint,
	"updated_at" bigint NOT NULL,
	"updated_by" bigint,
	"name" text NOT NULL,
	"description" text,
	"tag" text,
	"required" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"organization_id" text,
	CONSTRAINT "delivery_strategy_groups_public_id_unique" UNIQUE("public_id")
);
--> statement-breakpoint
-- An older baseline made this a table constraint rather than a bare index; drop whichever exists.
ALTER TABLE "delivery_strategies" DROP CONSTRAINT IF EXISTS "delivery_strategies_name_unique";--> statement-breakpoint
DROP INDEX IF EXISTS "delivery_strategies_name_unique";--> statement-breakpoint
ALTER TABLE "delivery_strategies" ADD COLUMN "group_id" bigint;--> statement-breakpoint
ALTER TABLE "delivery_strategies" ADD COLUMN "tag" text;--> statement-breakpoint
ALTER TABLE "delivery_strategy_groups" ADD CONSTRAINT "delivery_strategy_groups_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "delivery_strategy_groups_active_idx" ON "delivery_strategy_groups" USING btree ("active");--> statement-breakpoint
CREATE INDEX "delivery_strategy_groups_org_idx" ON "delivery_strategy_groups" USING btree ("organization_id");--> statement-breakpoint
ALTER TABLE "delivery_strategies" ADD CONSTRAINT "delivery_strategies_group_id_delivery_strategy_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."delivery_strategy_groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "delivery_strategies_group_name_unique" ON "delivery_strategies" USING btree ("group_id","name");--> statement-breakpoint
CREATE INDEX "delivery_strategies_group_idx" ON "delivery_strategies" USING btree ("group_id");--> statement-breakpoint
ALTER TABLE "customer_addresses" ADD COLUMN "delivery_strategy_ids" bigint[] DEFAULT '{}'::bigint[] NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "delivery_strategy_ids" bigint[] DEFAULT '{}'::bigint[] NOT NULL;--> statement-breakpoint
ALTER TABLE "deliveries" ADD COLUMN "delivery_strategy_ids" bigint[] DEFAULT '{}'::bigint[] NOT NULL;
