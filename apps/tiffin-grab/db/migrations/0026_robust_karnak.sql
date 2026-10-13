ALTER TABLE "orders" ADD COLUMN "look_out_at" bigint;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "look_out_by" bigint;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "look_out_note" text;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_look_out_by_users_id_fk" FOREIGN KEY ("look_out_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "orders_look_out_idx" ON "orders" USING btree ("look_out_at") WHERE "orders"."look_out_at" is not null;