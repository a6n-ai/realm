CREATE TYPE "public"."meal_rule_condition" AS ENUM('exclusive_to_plan');--> statement-breakpoint
CREATE TABLE "meal_rules" (
	"id" bigint PRIMARY KEY DEFAULT next_id() NOT NULL,
	"public_id" text NOT NULL,
	"app_id" bigint DEFAULT current_app_id() NOT NULL,
	"created_at" bigint NOT NULL,
	"created_by" bigint,
	"updated_at" bigint NOT NULL,
	"updated_by" bigint,
	"plan_id" bigint NOT NULL,
	"category_key" text NOT NULL,
	"condition" "meal_rule_condition" NOT NULL,
	"max_count" integer NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"organization_id" text,
	CONSTRAINT "meal_rules_public_id_unique" UNIQUE("public_id")
);
--> statement-breakpoint
ALTER TABLE "meal_rules" ADD CONSTRAINT "meal_rules_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_rules" ADD CONSTRAINT "meal_rules_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "meal_rules_plan_category_condition_unique" ON "meal_rules" USING btree ("plan_id","category_key","condition");
