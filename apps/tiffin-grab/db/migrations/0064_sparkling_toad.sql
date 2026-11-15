ALTER TABLE "renewal_activities" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "renewals" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "renewal_activities" CASCADE;--> statement-breakpoint
DROP TABLE "renewals" CASCADE;--> statement-breakpoint
ALTER TABLE "inquiries" DROP CONSTRAINT "inquiries_converted_order_id_orders_id_fk";
--> statement-breakpoint
DROP INDEX "inquiries_converted_order_idx";--> statement-breakpoint
ALTER TABLE "inquiries" DROP COLUMN "converted_order_id";--> statement-breakpoint
DROP TYPE "public"."renewal_activity_type";