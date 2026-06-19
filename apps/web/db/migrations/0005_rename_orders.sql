ALTER TYPE "subscription_status" RENAME TO "order_status";--> statement-breakpoint
ALTER TABLE "subscriptions" RENAME TO "orders";--> statement-breakpoint
ALTER TABLE "payments" RENAME COLUMN "subscription_id" TO "order_id";
