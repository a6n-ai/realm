ALTER TYPE "public"."inquiry_activity_type" ADD VALUE 'renewal_started';--> statement-breakpoint
ALTER TYPE "public"."inquiry_activity_type" ADD VALUE 'renewed';--> statement-breakpoint
ALTER TYPE "public"."inquiry_activity_type" ADD VALUE 'reminder_sent';--> statement-breakpoint
ALTER TYPE "public"."inquiry_activity_type" ADD VALUE 'reassigned';--> statement-breakpoint
ALTER TYPE "public"."inquiry_activity_type" ADD VALUE 'merged';--> statement-breakpoint
ALTER TYPE "public"."inquiry_activity_type" ADD VALUE 'match_conflict';--> statement-breakpoint
ALTER TYPE "public"."app_event" ADD VALUE 'inquiry_reinquiry' BEFORE 'ticket_created';--> statement-breakpoint
ALTER TABLE "inquiries" ADD COLUMN "customer_id" bigint;--> statement-breakpoint
ALTER TABLE "inquiries" ADD COLUMN "current_order_id" bigint;--> statement-breakpoint
ALTER TABLE "inquiries" ADD COLUMN "renewal_status" "renewal_status";--> statement-breakpoint
ALTER TABLE "inquiries" ADD COLUMN "renewal_status_set_at" bigint;--> statement-breakpoint
ALTER TABLE "inquiries" ADD COLUMN "renewal_status_source" "renewal_status_source";--> statement-breakpoint
ALTER TABLE "inquiries" ADD COLUMN "renewal_follow_up_at" bigint;--> statement-breakpoint
ALTER TABLE "inquiries" ADD COLUMN "renewal_lost_reason" "inquiry_lost_reason";--> statement-breakpoint
ALTER TABLE "inquiry_activities" ADD COLUMN "order_id" bigint;--> statement-breakpoint
ALTER TABLE "inquiry_activities" ADD COLUMN "lost_reason" "inquiry_lost_reason";--> statement-breakpoint
ALTER TABLE "inquiry_activities" ADD COLUMN "details" jsonb;--> statement-breakpoint
ALTER TABLE "inquiries" ADD CONSTRAINT "inquiries_customer_id_users_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inquiries" ADD CONSTRAINT "inquiries_current_order_id_orders_id_fk" FOREIGN KEY ("current_order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inquiry_activities" ADD CONSTRAINT "inquiry_activities_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "inquiries_customer_idx" ON "inquiries" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "inquiries_current_order_idx" ON "inquiries" USING btree ("current_order_id");--> statement-breakpoint
CREATE INDEX "inquiries_renewal_follow_up_idx" ON "inquiries" USING btree ("renewal_follow_up_at");--> statement-breakpoint
CREATE INDEX "inquiry_activities_order_idx" ON "inquiry_activities" USING btree ("order_id","created_at");