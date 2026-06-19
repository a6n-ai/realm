ALTER TABLE "orders" RENAME COLUMN "daily_qty" TO "persons";--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "meal_slots" text[] DEFAULT '{"lunch"}' NOT NULL;
