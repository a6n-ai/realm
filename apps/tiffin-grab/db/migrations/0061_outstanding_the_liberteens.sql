ALTER TABLE "inquiries" DROP CONSTRAINT "inquiries_current_owner_users_id_fk";
--> statement-breakpoint
ALTER TABLE "inquiries" ADD CONSTRAINT "inquiries_current_owner_users_id_fk" FOREIGN KEY ("current_owner") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;