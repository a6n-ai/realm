ALTER TABLE "meal_slots" DROP CONSTRAINT "meal_slots_key_unique";--> statement-breakpoint
ALTER TABLE "meal_slots" ADD COLUMN "plan_type" "plan_type" DEFAULT 'tiffin' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "meal_slots_type_key_unique" ON "meal_slots" USING btree ("plan_type","key");