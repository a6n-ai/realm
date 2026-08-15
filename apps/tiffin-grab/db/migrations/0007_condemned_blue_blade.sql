ALTER TYPE "public"."order_activity_type" ADD VALUE 'route_completed';--> statement-breakpoint
ALTER TYPE "public"."order_activity_type" ADD VALUE 'category_swap_applied';--> statement-breakpoint
ALTER TYPE "public"."order_activity_type" ADD VALUE 'category_swap_removed';--> statement-breakpoint
CREATE TABLE "category_swap_rules" (
	"id" bigint PRIMARY KEY DEFAULT next_id() NOT NULL,
	"public_id" text NOT NULL,
	"app_id" bigint DEFAULT current_app_id() NOT NULL,
	"created_at" bigint NOT NULL,
	"created_by" bigint,
	"updated_at" bigint NOT NULL,
	"updated_by" bigint,
	"meal_size_id" bigint NOT NULL,
	"from_category" text NOT NULL,
	"to_category" text NOT NULL,
	"qty_from" integer NOT NULL,
	"qty_to" integer NOT NULL,
	CONSTRAINT "category_swap_rules_public_id_unique" UNIQUE("public_id")
);
--> statement-breakpoint
CREATE TABLE "delivery_category_swaps" (
	"id" bigint PRIMARY KEY DEFAULT next_id() NOT NULL,
	"public_id" text NOT NULL,
	"app_id" bigint DEFAULT current_app_id() NOT NULL,
	"created_at" bigint NOT NULL,
	"created_by" bigint,
	"delivery_id" bigint NOT NULL,
	"rule_id" bigint,
	"from_category" text NOT NULL,
	"to_category" text NOT NULL,
	"qty_from" integer NOT NULL,
	"qty_to" integer NOT NULL,
	CONSTRAINT "delivery_category_swaps_public_id_unique" UNIQUE("public_id")
);
--> statement-breakpoint
CREATE TABLE "meal_payout" (
	"id" bigint PRIMARY KEY DEFAULT next_id() NOT NULL,
	"public_id" text NOT NULL,
	"app_id" bigint DEFAULT current_app_id() NOT NULL,
	"created_at" bigint NOT NULL,
	"created_by" bigint,
	"updated_at" bigint NOT NULL,
	"updated_by" bigint,
	"meal_size_id" bigint,
	"duration_package_id" bigint,
	"coins" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "meal_payout_public_id_unique" UNIQUE("public_id")
);
--> statement-breakpoint
ALTER TABLE "deliveries" ADD COLUMN "tiffin_units" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "deliveries" ADD COLUMN "optimo_completion_status" text;--> statement-breakpoint
ALTER TABLE "deliveries" ADD COLUMN "optimo_completed_at" bigint;--> statement-breakpoint
ALTER TABLE "deliveries" ADD COLUMN "optimo_completion_note" text;--> statement-breakpoint
ALTER TABLE "app" ADD COLUMN "max_wallet_balance" integer;--> statement-breakpoint
ALTER TABLE "category_swap_rules" ADD CONSTRAINT "category_swap_rules_meal_size_id_meal_sizes_id_fk" FOREIGN KEY ("meal_size_id") REFERENCES "public"."meal_sizes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_category_swaps" ADD CONSTRAINT "delivery_category_swaps_delivery_id_deliveries_id_fk" FOREIGN KEY ("delivery_id") REFERENCES "public"."deliveries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_payout" ADD CONSTRAINT "meal_payout_meal_size_id_meal_sizes_id_fk" FOREIGN KEY ("meal_size_id") REFERENCES "public"."meal_sizes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_payout" ADD CONSTRAINT "meal_payout_duration_package_id_duration_packages_id_fk" FOREIGN KEY ("duration_package_id") REFERENCES "public"."duration_packages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "category_swap_rules_direction_unique" ON "category_swap_rules" USING btree ("meal_size_id","from_category","to_category");--> statement-breakpoint
CREATE UNIQUE INDEX "delivery_category_swaps_delivery_rule_unique" ON "delivery_category_swaps" USING btree ("delivery_id","rule_id");--> statement-breakpoint
CREATE INDEX "delivery_category_swaps_delivery_idx" ON "delivery_category_swaps" USING btree ("delivery_id");--> statement-breakpoint
CREATE UNIQUE INDEX "meal_payout_combo_unique" ON "meal_payout" USING btree ("meal_size_id","duration_package_id");