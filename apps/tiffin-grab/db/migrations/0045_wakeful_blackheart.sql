CREATE TYPE "public"."owner_entity" AS ENUM('inquiry', 'order', 'ticket');--> statement-breakpoint
ALTER TABLE "inquiry_user_config" RENAME TO "owner_pool";--> statement-breakpoint
ALTER TABLE "owner_pool" DROP CONSTRAINT "inquiry_user_config_public_id_unique";--> statement-breakpoint
ALTER TABLE "owner_pool" DROP CONSTRAINT "inquiry_user_config_user_source_unique";--> statement-breakpoint
ALTER TABLE "owner_pool" DROP CONSTRAINT "inquiry_user_config_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "owner_pool" DROP CONSTRAINT "inquiry_user_config_source_id_lead_sources_id_fk";
--> statement-breakpoint
ALTER TABLE "owner_pool" DROP CONSTRAINT "inquiry_user_config_organization_id_organization_id_fk";
--> statement-breakpoint
DROP INDEX "inquiry_user_config_source_idx";--> statement-breakpoint
DROP INDEX "inquiry_user_config_organization_idx";--> statement-breakpoint
ALTER TABLE "owner_pool" ADD COLUMN "entity" "owner_entity" DEFAULT 'inquiry' NOT NULL;--> statement-breakpoint
ALTER TABLE "owner_pool" ADD CONSTRAINT "owner_pool_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "owner_pool" ADD CONSTRAINT "owner_pool_source_id_lead_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."lead_sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "owner_pool" ADD CONSTRAINT "owner_pool_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "owner_pool_source_idx" ON "owner_pool" USING btree ("source_id");--> statement-breakpoint
CREATE INDEX "owner_pool_organization_idx" ON "owner_pool" USING btree ("organization_id");--> statement-breakpoint
ALTER TABLE "owner_pool" ADD CONSTRAINT "owner_pool_public_id_unique" UNIQUE("public_id");--> statement-breakpoint
ALTER TABLE "owner_pool" ADD CONSTRAINT "owner_pool_entity_user_source_unique" UNIQUE("entity","user_id","source_id");