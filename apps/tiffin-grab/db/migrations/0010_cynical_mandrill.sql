CREATE TABLE "addon_categories" (
	"id" bigint PRIMARY KEY DEFAULT next_id() NOT NULL,
	"public_id" text NOT NULL,
	"app_id" bigint DEFAULT current_app_id() NOT NULL,
	"created_at" bigint NOT NULL,
	"created_by" bigint,
	"updated_at" bigint NOT NULL,
	"updated_by" bigint,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"organization_id" text,
	CONSTRAINT "addon_categories_public_id_unique" UNIQUE("public_id"),
	CONSTRAINT "addon_categories_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "dish_category_addon_categories" (
	"id" bigint PRIMARY KEY DEFAULT next_id() NOT NULL,
	"public_id" text NOT NULL,
	"app_id" bigint DEFAULT current_app_id() NOT NULL,
	"created_at" bigint NOT NULL,
	"created_by" bigint,
	"updated_at" bigint NOT NULL,
	"updated_by" bigint,
	"dish_category_id" bigint NOT NULL,
	"addon_category_id" bigint NOT NULL,
	"organization_id" text,
	CONSTRAINT "dish_category_addon_categories_public_id_unique" UNIQUE("public_id")
);
--> statement-breakpoint
ALTER TABLE "addons" ADD COLUMN "category" text NOT NULL DEFAULT 'uncategorized';--> statement-breakpoint
ALTER TABLE "addons" ALTER COLUMN "category" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "addon_categories" ADD CONSTRAINT "addon_categories_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dish_category_addon_categories" ADD CONSTRAINT "dish_category_addon_categories_dish_category_id_dish_categories_id_fk" FOREIGN KEY ("dish_category_id") REFERENCES "public"."dish_categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dish_category_addon_categories" ADD CONSTRAINT "dish_category_addon_categories_addon_category_id_addon_categories_id_fk" FOREIGN KEY ("addon_category_id") REFERENCES "public"."addon_categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dish_category_addon_categories" ADD CONSTRAINT "dish_category_addon_categories_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "dish_category_addon_categories_unique" ON "dish_category_addon_categories" USING btree ("dish_category_id","addon_category_id");