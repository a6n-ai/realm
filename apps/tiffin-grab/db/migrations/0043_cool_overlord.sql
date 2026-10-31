CREATE TABLE "customer_group_actions" (
	"id" bigint PRIMARY KEY DEFAULT next_id() NOT NULL,
	"public_id" text NOT NULL,
	"app_id" bigint DEFAULT current_app_id() NOT NULL,
	"created_at" bigint NOT NULL,
	"created_by" bigint,
	"updated_at" bigint NOT NULL,
	"updated_by" bigint,
	"group_id" bigint NOT NULL,
	"kind" text NOT NULL,
	"params" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"result" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "customer_group_actions_public_id_unique" UNIQUE("public_id")
);
--> statement-breakpoint
ALTER TABLE "coin_grant_group_members" ALTER COLUMN "awarded" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "coin_grant_groups" ALTER COLUMN "coins" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "coupons" ADD COLUMN "customer_group_id" bigint;--> statement-breakpoint
ALTER TABLE "customer_group_actions" ADD CONSTRAINT "customer_group_actions_group_id_coin_grant_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."coin_grant_groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "customer_group_actions_group_created_idx" ON "customer_group_actions" USING btree ("group_id","created_at");--> statement-breakpoint
ALTER TABLE "coupons" ADD CONSTRAINT "coupons_customer_group_id_coin_grant_groups_id_fk" FOREIGN KEY ("customer_group_id") REFERENCES "public"."coin_grant_groups"("id") ON DELETE no action ON UPDATE no action;