ALTER TABLE "customer_addresses" DROP CONSTRAINT "customer_addresses_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "customer_addresses" ADD CONSTRAINT "customer_addresses_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;