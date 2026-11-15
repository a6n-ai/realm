CREATE TABLE "category_cost_rates" (
	"id" bigint PRIMARY KEY DEFAULT next_id() NOT NULL,
	"public_id" text NOT NULL,
	"app_id" bigint DEFAULT current_app_id() NOT NULL,
	"created_at" bigint NOT NULL,
	"created_by" bigint,
	"updated_at" bigint NOT NULL,
	"updated_by" bigint,
	"category" text NOT NULL,
	"plan_id" bigint,
	"cost_base" numeric(10, 2) DEFAULT '0' NOT NULL,
	"cost_per_tu" numeric(10, 4) DEFAULT '0' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"organization_id" text,
	CONSTRAINT "category_cost_rates_public_id_unique" UNIQUE("public_id"),
	CONSTRAINT "category_cost_rates_scope_unique" UNIQUE NULLS NOT DISTINCT("category","plan_id","organization_id")
);
--> statement-breakpoint
ALTER TABLE "category_cost_rates" ADD CONSTRAINT "category_cost_rates_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "category_cost_rates" ADD CONSTRAINT "category_cost_rates_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;