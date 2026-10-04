ALTER TABLE "addons" ADD COLUMN "plan_id" bigint;--> statement-breakpoint
ALTER TABLE "order_addons" ADD COLUMN "plan_id" bigint;--> statement-breakpoint
ALTER TABLE "addons" ADD CONSTRAINT "addons_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_addons" ADD CONSTRAINT "order_addons_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE no action ON UPDATE no action;