ALTER TABLE "orders" ADD COLUMN "start_date" date NOT NULL DEFAULT '2026-06-23';--> statement-breakpoint
ALTER TABLE "plans" ADD COLUMN "allowed_start_days" text[] NOT NULL DEFAULT ARRAY['mon','tue','wed','thu','fri']::text[];
