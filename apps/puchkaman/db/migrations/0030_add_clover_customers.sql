CREATE TABLE "clover_customers" (
	"id" bigint PRIMARY KEY DEFAULT next_id() NOT NULL,
	"public_id" text NOT NULL,
	"app_id" bigint DEFAULT current_app_id() NOT NULL,
	"created_at" bigint NOT NULL,
	"created_by" bigint,
	"updated_at" bigint NOT NULL,
	"updated_by" bigint,
	"name" text NOT NULL,
	"first_name" text,
	"last_name" text,
	"email" text,
	"phone" text,
	"marketing_allowed" boolean DEFAULT false NOT NULL,
	"customer_since" bigint,
	"clover_customer_id" text,
	"clover_last_synced_at" bigint,
	"organization_id" text,
	CONSTRAINT "clover_customers_public_id_unique" UNIQUE("public_id"),
	CONSTRAINT "clover_customers_clover_customer_id_unique" UNIQUE("clover_customer_id")
);
--> statement-breakpoint
ALTER TABLE "clover_customers" ADD CONSTRAINT "clover_customers_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;