ALTER TABLE "customer_addresses" DROP CONSTRAINT "customer_addresses_user_id_fkey";
--> statement-breakpoint
ALTER TABLE "customer_addresses" ADD CONSTRAINT "customer_addresses_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "orders" DROP CONSTRAINT "orders_address_id_fkey";
--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_address_id_fkey" FOREIGN KEY ("address_id") REFERENCES "customer_addresses"("id") ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE "deliveries" DROP CONSTRAINT "deliveries_address_id_fkey";
--> statement-breakpoint
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_address_id_fkey" FOREIGN KEY ("address_id") REFERENCES "customer_addresses"("id") ON DELETE SET NULL;
