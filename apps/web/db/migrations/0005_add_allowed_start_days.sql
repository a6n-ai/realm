ALTER TABLE "plans" ADD COLUMN "allowed_start_days" text[] NOT NULL DEFAULT ARRAY['mon','tue','wed','thu','fri']::text[];
