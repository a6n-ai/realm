-- app_settings becomes the app / tenant entity (rename first so the function below
-- and every FK can reference "app").
ALTER TABLE "app_settings" RENAME TO "app";--> statement-breakpoint
ALTER TABLE "app" ADD COLUMN "currency" text DEFAULT 'INR' NOT NULL;--> statement-breakpoint
-- Resolve the singleton app id at insert time — rebuild-safe (no hardcoded id).
CREATE OR REPLACE FUNCTION current_app_id() RETURNS bigint LANGUAGE sql STABLE AS $fn$ SELECT id FROM app ORDER BY id LIMIT 1 $fn$;--> statement-breakpoint
-- Inquiry journey: quoted stage + sales activity types + activity amount.
ALTER TYPE "public"."inquiry_stage" ADD VALUE 'quoted' BEFORE 'follow_up';--> statement-breakpoint
ALTER TYPE "public"."inquiry_activity_type" ADD VALUE 'quote_sent';--> statement-breakpoint
ALTER TYPE "public"."inquiry_activity_type" ADD VALUE 'sample_sent';--> statement-breakpoint
ALTER TYPE "public"."inquiry_activity_type" ADD VALUE 'payment_link_sent';--> statement-breakpoint
ALTER TYPE "public"."inquiry_activity_type" ADD VALUE 'visit';--> statement-breakpoint
ALTER TYPE "public"."inquiry_activity_type" ADD VALUE 'callback';--> statement-breakpoint
ALTER TABLE "inquiry_activities" ADD COLUMN "amount" integer;--> statement-breakpoint
-- app_id on EVERY table. Tables are empty at migrate time (fresh rebuild), so the
-- NOT NULL default is never evaluated here; the seed creates the app row first and
-- every later insert resolves app_id via current_app_id(). FK enforces integrity.
DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename LOOP
    EXECUTE format('ALTER TABLE %I ADD COLUMN app_id bigint NOT NULL DEFAULT current_app_id()', t);
    EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (app_id) REFERENCES app(id)', t, 'fk_' || t || '_app');
  END LOOP;
END $$;
