CREATE TYPE "public"."meal_rule_match_mode" AS ENUM('all', 'any');--> statement-breakpoint
CREATE TYPE "public"."meal_rule_action" AS ENUM('max_qualifying', 'forbid', 'cannot_coexist');--> statement-breakpoint
CREATE TYPE "public"."meal_rule_field" AS ENUM('dish_plan', 'category', 'dish', 'dish_name');--> statement-breakpoint
CREATE TYPE "public"."meal_rule_operator" AS ENUM('is', 'is_not', 'is_one_of', 'is_not_one_of', 'contains', 'not_contains', 'equals', 'starts_with', 'ends_with');--> statement-breakpoint

ALTER TABLE "meal_rules" ADD COLUMN "name" text;--> statement-breakpoint
ALTER TABLE "meal_rules" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "meal_rules" ADD COLUMN "scope_plan_id" bigint;--> statement-breakpoint
ALTER TABLE "meal_rules" ADD CONSTRAINT "meal_rules_scope_plan_id_plans_id_fk" FOREIGN KEY ("scope_plan_id") REFERENCES "public"."plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_rules" ADD COLUMN "scope_meal_size_id" bigint;--> statement-breakpoint
ALTER TABLE "meal_rules" ADD CONSTRAINT "meal_rules_scope_meal_size_id_meal_sizes_id_fk" FOREIGN KEY ("scope_meal_size_id") REFERENCES "public"."meal_sizes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_rules" ADD COLUMN "match_mode" "meal_rule_match_mode" DEFAULT 'all' NOT NULL;--> statement-breakpoint
ALTER TABLE "meal_rules" ADD COLUMN "action" "meal_rule_action" DEFAULT 'max_qualifying' NOT NULL;--> statement-breakpoint
ALTER TABLE "meal_rules" ADD COLUMN "action_value" integer;--> statement-breakpoint
ALTER TABLE "meal_rules" ADD COLUMN "priority" integer DEFAULT 0 NOT NULL;--> statement-breakpoint

-- The legacy single-condition columns become nullable; new rules do not use them.
-- They are dropped in a later migration, once the new path has run in production.
ALTER TABLE "meal_rules" ALTER COLUMN "plan_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "meal_rules" ALTER COLUMN "category_key" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "meal_rules" ALTER COLUMN "condition" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "meal_rules" ALTER COLUMN "max_count" DROP NOT NULL;--> statement-breakpoint

-- One rule per (plan, category, condition) was the old shape; the new model is
-- explicitly many rules per scope.
DROP INDEX IF EXISTS "meal_rules_plan_category_condition_unique";--> statement-breakpoint

CREATE TABLE "meal_rule_conditions" (
	"id" bigint PRIMARY KEY DEFAULT next_id() NOT NULL,
	"public_id" text NOT NULL,
	"app_id" bigint DEFAULT current_app_id() NOT NULL,
	"created_at" bigint NOT NULL,
	"created_by" bigint,
	"updated_at" bigint NOT NULL,
	"updated_by" bigint,
	"rule_id" bigint NOT NULL,
	"field" "meal_rule_field" NOT NULL,
	"operator" "meal_rule_operator" NOT NULL,
	"value_ids" bigint[],
	"value_keys" text[],
	"value_text" text,
	"organization_id" text,
	CONSTRAINT "meal_rule_conditions_public_id_unique" UNIQUE("public_id")
);--> statement-breakpoint
ALTER TABLE "meal_rule_conditions" ADD CONSTRAINT "meal_rule_conditions_rule_id_meal_rules_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."meal_rules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_rule_conditions" ADD CONSTRAINT "meal_rule_conditions_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "meal_rule_conditions_rule_idx" ON "meal_rule_conditions" ("rule_id");--> statement-breakpoint

-- Backfill: every existing rule becomes scope=its plan, action=max_qualifying,
-- with TWO conditions — the category it named, and the diet it implicitly meant.
-- `exclusive_to_plan` resolved through exclusiveDishIdsForPlan, which is an alias
-- of dishIdsForPlan: dishes.plan_id is single-valued, so "exclusive to this plan"
-- has always meant "this dish's plan is X". That is the `dish_plan is X` condition.
UPDATE "meal_rules"
   SET "scope_plan_id" = "plan_id",
       "action" = 'max_qualifying',
       "action_value" = "max_count",
       "match_mode" = 'all',
       "name" = COALESCE("name", 'Plan-exclusive limit')
 WHERE "condition" = 'exclusive_to_plan';--> statement-breakpoint

INSERT INTO "meal_rule_conditions"
  ("public_id", "app_id", "created_at", "updated_at", "rule_id", "field", "operator", "value_keys", "organization_id")
SELECT 'mrc_bf_c_' || r."id", r."app_id", r."created_at", r."updated_at", r."id", 'category', 'is', ARRAY[r."category_key"], r."organization_id"
  FROM "meal_rules" r
 WHERE r."condition" = 'exclusive_to_plan' AND r."category_key" IS NOT NULL;--> statement-breakpoint

INSERT INTO "meal_rule_conditions"
  ("public_id", "app_id", "created_at", "updated_at", "rule_id", "field", "operator", "value_ids", "organization_id")
SELECT 'mrc_bf_p_' || r."id", r."app_id", r."created_at", r."updated_at", r."id", 'dish_plan', 'is', ARRAY[r."plan_id"], r."organization_id"
  FROM "meal_rules" r
 WHERE r."condition" = 'exclusive_to_plan' AND r."plan_id" IS NOT NULL;
