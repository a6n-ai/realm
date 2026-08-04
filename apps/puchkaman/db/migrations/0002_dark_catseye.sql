CREATE TABLE "menu_items" (
	"id" bigint PRIMARY KEY DEFAULT next_id() NOT NULL,
	"public_id" text NOT NULL,
	"app_id" bigint DEFAULT current_app_id() NOT NULL,
	"created_at" bigint NOT NULL,
	"created_by" bigint,
	"updated_at" bigint NOT NULL,
	"updated_by" bigint,
	"menu_id" bigint NOT NULL,
	"product_id" bigint NOT NULL,
	"price" numeric(10, 2) DEFAULT '0' NOT NULL,
	"base_price" numeric(10, 2),
	"enabled" boolean DEFAULT true NOT NULL,
	"clover_last_synced_at" bigint,
	CONSTRAINT "menu_items_public_id_unique" UNIQUE("public_id")
);
--> statement-breakpoint
ALTER TABLE "menus" ADD COLUMN "clover_menu_type" text;--> statement-breakpoint
ALTER TABLE "menus" ADD COLUMN "clover_provider_ids" text[];--> statement-breakpoint
ALTER TABLE "menus" ADD COLUMN "clover_published_at" bigint;--> statement-breakpoint
ALTER TABLE "menus" ADD COLUMN "clover_fallback_menu" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_menu_id_menus_id_fk" FOREIGN KEY ("menu_id") REFERENCES "public"."menus"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "menu_items_menu_product_uidx" ON "menu_items" USING btree ("menu_id","product_id");--> statement-breakpoint
-- Hand-added: drizzle-kit does not emit the app_id FK. Re-run the baseline's
-- table-agnostic idempotent loop so menu_items gets fk_menu_items_app too.
DO $do$
DECLARE t text;
BEGIN
  FOR t IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND EXISTS (
        SELECT 1 FROM pg_attribute a
        WHERE a.attrelid = c.oid AND a.attname = 'app_id' AND a.attnum > 0 AND NOT a.attisdropped
      )
    ORDER BY c.relname
  LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_' || t || '_app') THEN
      EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (app_id) REFERENCES app(id)', t, 'fk_' || t || '_app');
    END IF;
  END LOOP;
END
$do$;
