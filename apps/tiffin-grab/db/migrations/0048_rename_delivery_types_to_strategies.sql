ALTER TABLE "delivery_types" RENAME TO "delivery_strategies";
--> statement-breakpoint
ALTER TABLE "delivery_strategies" RENAME CONSTRAINT "delivery_types_pkey" TO "delivery_strategies_pkey";
--> statement-breakpoint
ALTER TABLE "delivery_strategies" RENAME CONSTRAINT "delivery_types_public_id_unique" TO "delivery_strategies_public_id_unique";
--> statement-breakpoint
ALTER TABLE "delivery_strategies" RENAME CONSTRAINT "delivery_types_name_unique" TO "delivery_strategies_name_unique";
--> statement-breakpoint
ALTER INDEX "delivery_types_active_idx" RENAME TO "delivery_strategies_active_idx";
--> statement-breakpoint
ALTER INDEX "delivery_types_org_idx" RENAME TO "delivery_strategies_org_idx";
--> statement-breakpoint
ALTER TABLE "delivery_strategies" ALTER COLUMN "public_id" SET DEFAULT ('dsp_'::text || substr(md5(((random())::text || (clock_timestamp())::text)), 1, 10));
--> statement-breakpoint
ALTER TABLE "orders" RENAME COLUMN "delivery_type_id" TO "delivery_strategy_id";
--> statement-breakpoint
ALTER TABLE "orders" RENAME CONSTRAINT "orders_delivery_type_id_fkey" TO "orders_delivery_strategy_id_fkey";
--> statement-breakpoint
ALTER INDEX "orders_delivery_type_idx" RENAME TO "orders_delivery_strategy_idx";
--> statement-breakpoint
ALTER TABLE "users" RENAME COLUMN "delivery_type_id" TO "delivery_strategy_id";
--> statement-breakpoint
ALTER TABLE "users" RENAME CONSTRAINT "users_delivery_type_id_fkey" TO "users_delivery_strategy_id_fkey";
