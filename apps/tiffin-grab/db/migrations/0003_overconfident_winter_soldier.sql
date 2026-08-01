ALTER TABLE "deliveries" ADD COLUMN "route_driver_serial" text;--> statement-breakpoint
ALTER TABLE "deliveries" ADD COLUMN "route_driver_name" text;--> statement-breakpoint
ALTER TABLE "deliveries" ADD COLUMN "route_stop_number" integer;--> statement-breakpoint
ALTER TABLE "deliveries" ADD COLUMN "route_synced_at" bigint;