ALTER TYPE "public"."ticket_category" ADD VALUE 'food_meal';--> statement-breakpoint
ALTER TYPE "public"."ticket_category" ADD VALUE 'delivery';--> statement-breakpoint
ALTER TYPE "public"."ticket_category" ADD VALUE 'plan_subscription';--> statement-breakpoint
ALTER TYPE "public"."ticket_category" ADD VALUE 'packaging';--> statement-breakpoint
ALTER TYPE "public"."ticket_category" ADD VALUE 'account_website';--> statement-breakpoint
ALTER TYPE "public"."ticket_category" ADD VALUE 'feedback';--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "subcategory" text;
