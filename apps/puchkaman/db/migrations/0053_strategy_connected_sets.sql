CREATE TABLE "delivery_strategy_connections" (
	"id" bigint PRIMARY KEY DEFAULT next_id() NOT NULL,
	"public_id" text NOT NULL,
	"app_id" bigint DEFAULT current_app_id() NOT NULL,
	"created_at" bigint NOT NULL,
	"created_by" bigint,
	"updated_at" bigint NOT NULL,
	"updated_by" bigint,
	"name" text NOT NULL,
	"group_id" bigint NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"organization_id" text,
	CONSTRAINT "delivery_strategy_connections_public_id_unique" UNIQUE("public_id")
);
--> statement-breakpoint
ALTER TABLE "delivery_strategies" ADD COLUMN "connection_id" bigint;--> statement-breakpoint
ALTER TABLE "delivery_strategy_connections" ADD CONSTRAINT "delivery_strategy_connections_group_id_delivery_strategy_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."delivery_strategy_groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_strategy_connections" ADD CONSTRAINT "delivery_strategy_connections_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "delivery_strategy_connections_group_idx" ON "delivery_strategy_connections" USING btree ("group_id");--> statement-breakpoint
CREATE INDEX "delivery_strategy_connections_org_idx" ON "delivery_strategy_connections" USING btree ("organization_id");--> statement-breakpoint
ALTER TABLE "delivery_strategies" ADD CONSTRAINT "delivery_strategies_connection_id_delivery_strategy_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."delivery_strategy_connections"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "delivery_strategies_connection_idx" ON "delivery_strategies" USING btree ("connection_id");--> statement-breakpoint
ALTER TABLE "delivery_strategy_groups" DROP COLUMN "required";