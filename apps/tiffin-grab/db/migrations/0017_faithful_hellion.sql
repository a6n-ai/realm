CREATE TYPE "public"."meal_item_role" AS ENUM('main', 'side_1', 'side_2');--> statement-breakpoint
CREATE TABLE "menu_day_sides" (
	"id" bigint PRIMARY KEY DEFAULT next_id() NOT NULL,
	"public_id" text NOT NULL,
	"app_id" bigint DEFAULT current_app_id() NOT NULL,
	"created_at" bigint NOT NULL,
	"created_by" bigint,
	"updated_at" bigint NOT NULL,
	"updated_by" bigint,
	"menu_week_id" bigint NOT NULL,
	"day_of_week" "day_of_week" NOT NULL,
	"category_id" bigint NOT NULL,
	"role" "meal_item_role" NOT NULL,
	"source_category_id" bigint,
	"dish_id" bigint,
	"organization_id" text,
	CONSTRAINT "menu_day_sides_public_id_unique" UNIQUE("public_id"),
	CONSTRAINT "menu_day_sides_one_source" CHECK (("menu_day_sides"."source_category_id" is null) <> ("menu_day_sides"."dish_id" is null))
);
--> statement-breakpoint
CREATE TABLE "menu_side_defaults" (
	"id" bigint PRIMARY KEY DEFAULT next_id() NOT NULL,
	"public_id" text NOT NULL,
	"app_id" bigint DEFAULT current_app_id() NOT NULL,
	"created_at" bigint NOT NULL,
	"created_by" bigint,
	"updated_at" bigint NOT NULL,
	"updated_by" bigint,
	"category_id" bigint NOT NULL,
	"role" "meal_item_role" NOT NULL,
	"source_category_id" bigint NOT NULL,
	"organization_id" text,
	CONSTRAINT "menu_side_defaults_public_id_unique" UNIQUE("public_id")
);
--> statement-breakpoint
ALTER TABLE "meal_size_items" ADD COLUMN "role" "meal_item_role" DEFAULT 'main' NOT NULL;--> statement-breakpoint
ALTER TABLE "menu_day_sides" ADD CONSTRAINT "menu_day_sides_menu_week_id_menu_weeks_id_fk" FOREIGN KEY ("menu_week_id") REFERENCES "public"."menu_weeks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_day_sides" ADD CONSTRAINT "menu_day_sides_category_id_dish_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."dish_categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_day_sides" ADD CONSTRAINT "menu_day_sides_source_category_id_dish_categories_id_fk" FOREIGN KEY ("source_category_id") REFERENCES "public"."dish_categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_day_sides" ADD CONSTRAINT "menu_day_sides_dish_id_dishes_id_fk" FOREIGN KEY ("dish_id") REFERENCES "public"."dishes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_day_sides" ADD CONSTRAINT "menu_day_sides_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_side_defaults" ADD CONSTRAINT "menu_side_defaults_category_id_dish_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."dish_categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_side_defaults" ADD CONSTRAINT "menu_side_defaults_source_category_id_dish_categories_id_fk" FOREIGN KEY ("source_category_id") REFERENCES "public"."dish_categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_side_defaults" ADD CONSTRAINT "menu_side_defaults_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "menu_day_sides_unique" ON "menu_day_sides" USING btree ("menu_week_id","day_of_week","category_id","role");--> statement-breakpoint
CREATE UNIQUE INDEX "menu_side_defaults_unique" ON "menu_side_defaults" USING btree ("category_id","role");