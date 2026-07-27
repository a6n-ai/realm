CREATE TABLE "product_categories" (
	"id" bigint PRIMARY KEY DEFAULT next_id() NOT NULL,
	"public_id" text NOT NULL,
	"app_id" bigint DEFAULT current_app_id() NOT NULL,
	"created_at" bigint NOT NULL,
	"created_by" bigint,
	"updated_at" bigint NOT NULL,
	"updated_by" bigint,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"color_code" text,
	"active" boolean DEFAULT true NOT NULL,
	"clover_category_id" text,
	"clover_parent_category_id" text,
	"clover_last_synced_at" bigint,
	CONSTRAINT "product_categories_public_id_unique" UNIQUE("public_id"),
	CONSTRAINT "product_categories_clover_category_id_unique" UNIQUE("clover_category_id")
);
--> statement-breakpoint
CREATE TABLE "product_category_items" (
	"id" bigint PRIMARY KEY DEFAULT next_id() NOT NULL,
	"public_id" text NOT NULL,
	"app_id" bigint DEFAULT current_app_id() NOT NULL,
	"created_at" bigint NOT NULL,
	"created_by" bigint,
	"updated_at" bigint NOT NULL,
	"updated_by" bigint,
	"category_id" bigint NOT NULL,
	"product_id" bigint NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "product_category_items_public_id_unique" UNIQUE("public_id")
);
--> statement-breakpoint
CREATE TABLE "modifier_groups" (
	"id" bigint PRIMARY KEY DEFAULT next_id() NOT NULL,
	"public_id" text NOT NULL,
	"app_id" bigint DEFAULT current_app_id() NOT NULL,
	"created_at" bigint NOT NULL,
	"created_by" bigint,
	"updated_at" bigint NOT NULL,
	"updated_by" bigint,
	"name" text NOT NULL,
	"alternate_name" text,
	"min_required" integer,
	"max_allowed" integer,
	"show_by_default" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"clover_modifier_group_id" text,
	"clover_last_synced_at" bigint,
	CONSTRAINT "modifier_groups_public_id_unique" UNIQUE("public_id"),
	CONSTRAINT "modifier_groups_clover_modifier_group_id_unique" UNIQUE("clover_modifier_group_id")
);
--> statement-breakpoint
CREATE TABLE "modifiers" (
	"id" bigint PRIMARY KEY DEFAULT next_id() NOT NULL,
	"public_id" text NOT NULL,
	"app_id" bigint DEFAULT current_app_id() NOT NULL,
	"created_at" bigint NOT NULL,
	"created_by" bigint,
	"updated_at" bigint NOT NULL,
	"updated_by" bigint,
	"modifier_group_id" bigint NOT NULL,
	"name" text NOT NULL,
	"alternate_name" text,
	"price" numeric(10, 2) DEFAULT '0' NOT NULL,
	"available" boolean DEFAULT true NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"clover_modifier_id" text,
	"clover_last_synced_at" bigint,
	CONSTRAINT "modifiers_public_id_unique" UNIQUE("public_id"),
	CONSTRAINT "modifiers_clover_modifier_id_unique" UNIQUE("clover_modifier_id")
);
--> statement-breakpoint
CREATE TABLE "product_modifier_groups" (
	"id" bigint PRIMARY KEY DEFAULT next_id() NOT NULL,
	"public_id" text NOT NULL,
	"app_id" bigint DEFAULT current_app_id() NOT NULL,
	"created_at" bigint NOT NULL,
	"created_by" bigint,
	"updated_at" bigint NOT NULL,
	"updated_by" bigint,
	"product_id" bigint NOT NULL,
	"modifier_group_id" bigint NOT NULL,
	CONSTRAINT "product_modifier_groups_public_id_unique" UNIQUE("public_id")
);
--> statement-breakpoint
CREATE TABLE "discounts" (
	"id" bigint PRIMARY KEY DEFAULT next_id() NOT NULL,
	"public_id" text NOT NULL,
	"app_id" bigint DEFAULT current_app_id() NOT NULL,
	"created_at" bigint NOT NULL,
	"created_by" bigint,
	"updated_at" bigint NOT NULL,
	"updated_by" bigint,
	"name" text NOT NULL,
	"amount" numeric(10, 2),
	"percentage" numeric(6, 2),
	"active" boolean DEFAULT true NOT NULL,
	"clover_discount_id" text,
	"clover_last_synced_at" bigint,
	CONSTRAINT "discounts_public_id_unique" UNIQUE("public_id"),
	CONSTRAINT "discounts_clover_discount_id_unique" UNIQUE("clover_discount_id")
);
--> statement-breakpoint
CREATE TABLE "menus" (
	"id" bigint PRIMARY KEY DEFAULT next_id() NOT NULL,
	"public_id" text NOT NULL,
	"app_id" bigint DEFAULT current_app_id() NOT NULL,
	"created_at" bigint NOT NULL,
	"created_by" bigint,
	"updated_at" bigint NOT NULL,
	"updated_by" bigint,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"clover_menu_id" text,
	"clover_last_synced_at" bigint,
	CONSTRAINT "menus_public_id_unique" UNIQUE("public_id"),
	CONSTRAINT "menus_clover_menu_id_unique" UNIQUE("clover_menu_id")
);
--> statement-breakpoint
CREATE TABLE "menu_sections" (
	"id" bigint PRIMARY KEY DEFAULT next_id() NOT NULL,
	"public_id" text NOT NULL,
	"app_id" bigint DEFAULT current_app_id() NOT NULL,
	"created_at" bigint NOT NULL,
	"created_by" bigint,
	"updated_at" bigint NOT NULL,
	"updated_by" bigint,
	"menu_id" bigint NOT NULL,
	"category_id" bigint NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "menu_sections_public_id_unique" UNIQUE("public_id")
);
--> statement-breakpoint
ALTER TABLE "product_category_items" ADD CONSTRAINT "product_category_items_category_id_product_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."product_categories"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "product_category_items" ADD CONSTRAINT "product_category_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "modifiers" ADD CONSTRAINT "modifiers_modifier_group_id_modifier_groups_id_fk" FOREIGN KEY ("modifier_group_id") REFERENCES "public"."modifier_groups"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "product_modifier_groups" ADD CONSTRAINT "product_modifier_groups_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "product_modifier_groups" ADD CONSTRAINT "product_modifier_groups_modifier_group_id_modifier_groups_id_fk" FOREIGN KEY ("modifier_group_id") REFERENCES "public"."modifier_groups"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "menu_sections" ADD CONSTRAINT "menu_sections_menu_id_menus_id_fk" FOREIGN KEY ("menu_id") REFERENCES "public"."menus"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "menu_sections" ADD CONSTRAINT "menu_sections_category_id_product_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."product_categories"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "product_category_items_cat_prod_uidx" ON "product_category_items" USING btree ("category_id","product_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "product_modifier_groups_prod_group_uidx" ON "product_modifier_groups" USING btree ("product_id","modifier_group_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "menu_sections_menu_cat_uidx" ON "menu_sections" USING btree ("menu_id","category_id");
