CREATE TABLE "custom_meal_pricing" (
	"id" bigint PRIMARY KEY DEFAULT next_id() NOT NULL,
	"public_id" text NOT NULL,
	"app_id" bigint DEFAULT current_app_id() NOT NULL,
	"created_at" bigint NOT NULL,
	"created_by" bigint,
	"updated_at" bigint NOT NULL,
	"updated_by" bigint,
	"category_id" bigint NOT NULL,
	"plan_id" bigint NOT NULL,
	"price_per_tu" numeric(10, 2) NOT NULL,
	"max_tu" numeric(6, 2),
	"active" boolean DEFAULT true NOT NULL,
	"organization_id" text,
	CONSTRAINT "custom_meal_pricing_public_id_unique" UNIQUE("public_id")
);
--> statement-breakpoint
ALTER TABLE "meal_sizes" ADD COLUMN "custom" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "meal_sizes" ADD COLUMN "composition_key" text;--> statement-breakpoint
ALTER TABLE "custom_meal_pricing" ADD CONSTRAINT "custom_meal_pricing_category_id_dish_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."dish_categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_meal_pricing" ADD CONSTRAINT "custom_meal_pricing_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_meal_pricing" ADD CONSTRAINT "custom_meal_pricing_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "custom_meal_pricing_category_plan_unique" ON "custom_meal_pricing" USING btree ("category_id","plan_id");--> statement-breakpoint
CREATE UNIQUE INDEX "meal_sizes_composition_key_unique" ON "meal_sizes" USING btree ("composition_key") WHERE "meal_sizes"."custom";