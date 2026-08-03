CREATE TABLE "printer_labels" (
	"id" bigint PRIMARY KEY DEFAULT next_id() NOT NULL,
	"public_id" text NOT NULL,
	"app_id" bigint DEFAULT current_app_id() NOT NULL,
	"created_at" bigint NOT NULL,
	"created_by" bigint,
	"updated_at" bigint NOT NULL,
	"updated_by" bigint,
	"name" text NOT NULL,
	"show_in_reporting" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"clover_tag_id" text,
	"clover_last_synced_at" bigint,
	CONSTRAINT "printer_labels_public_id_unique" UNIQUE("public_id"),
	CONSTRAINT "printer_labels_clover_tag_id_unique" UNIQUE("clover_tag_id")
);
--> statement-breakpoint
CREATE TABLE "product_printer_labels" (
	"id" bigint PRIMARY KEY DEFAULT next_id() NOT NULL,
	"public_id" text NOT NULL,
	"app_id" bigint DEFAULT current_app_id() NOT NULL,
	"created_at" bigint NOT NULL,
	"created_by" bigint,
	"updated_at" bigint NOT NULL,
	"updated_by" bigint,
	"product_id" bigint NOT NULL,
	"printer_label_id" bigint NOT NULL,
	CONSTRAINT "product_printer_labels_public_id_unique" UNIQUE("public_id")
);
--> statement-breakpoint
CREATE TABLE "product_tax_rates" (
	"id" bigint PRIMARY KEY DEFAULT next_id() NOT NULL,
	"public_id" text NOT NULL,
	"app_id" bigint DEFAULT current_app_id() NOT NULL,
	"created_at" bigint NOT NULL,
	"created_by" bigint,
	"updated_at" bigint NOT NULL,
	"updated_by" bigint,
	"product_id" bigint NOT NULL,
	"tax_rate_id" bigint NOT NULL,
	CONSTRAINT "product_tax_rates_public_id_unique" UNIQUE("public_id")
);
--> statement-breakpoint
CREATE TABLE "tax_rates" (
	"id" bigint PRIMARY KEY DEFAULT next_id() NOT NULL,
	"public_id" text NOT NULL,
	"app_id" bigint DEFAULT current_app_id() NOT NULL,
	"created_at" bigint NOT NULL,
	"created_by" bigint,
	"updated_at" bigint NOT NULL,
	"updated_by" bigint,
	"name" text NOT NULL,
	"rate" numeric(9, 5),
	"tax_amount" integer,
	"tax_type" text,
	"is_default" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"clover_tax_rate_id" text,
	"clover_last_synced_at" bigint,
	CONSTRAINT "tax_rates_public_id_unique" UNIQUE("public_id"),
	CONSTRAINT "tax_rates_clover_tax_rate_id_unique" UNIQUE("clover_tax_rate_id")
);
--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "clover_online_name" text;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "clover_enabled_online" boolean;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "clover_age_restricted" boolean;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "clover_default_tax_rates" boolean;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "clover_is_revenue" boolean;--> statement-breakpoint
ALTER TABLE "product_printer_labels" ADD CONSTRAINT "product_printer_labels_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_printer_labels" ADD CONSTRAINT "product_printer_labels_printer_label_id_printer_labels_id_fk" FOREIGN KEY ("printer_label_id") REFERENCES "public"."printer_labels"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_tax_rates" ADD CONSTRAINT "product_tax_rates_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_tax_rates" ADD CONSTRAINT "product_tax_rates_tax_rate_id_tax_rates_id_fk" FOREIGN KEY ("tax_rate_id") REFERENCES "public"."tax_rates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "product_printer_labels_prod_label_uidx" ON "product_printer_labels" USING btree ("product_id","printer_label_id");--> statement-breakpoint
CREATE UNIQUE INDEX "product_tax_rates_prod_tax_uidx" ON "product_tax_rates" USING btree ("product_id","tax_rate_id");--> statement-breakpoint
-- Hand-added: drizzle-kit does not emit the app_id FK, which the baseline
-- attaches with this table-agnostic idempotent loop. Re-run it so the four new
-- tables get fk_<table>_app too.
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
