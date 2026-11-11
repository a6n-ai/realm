CREATE TYPE "public"."renewal_activity_type" AS ENUM('note', 'call', 'whatsapp', 'email', 'callback', 'status_change', 'reminder_sent');--> statement-breakpoint
CREATE TYPE "public"."renewal_status" AS ENUM('renewed', 'unresponsive', 'not_renewed', 'expected', 'follow_up', 'pending_payment');--> statement-breakpoint
CREATE TYPE "public"."renewal_status_source" AS ENUM('staff', 'auto');--> statement-breakpoint
CREATE TABLE "renewal_activities" (
	"id" bigint PRIMARY KEY DEFAULT next_id() NOT NULL,
	"public_id" text NOT NULL,
	"app_id" bigint DEFAULT current_app_id() NOT NULL,
	"created_at" bigint NOT NULL,
	"created_by" bigint,
	"renewal_id" bigint NOT NULL,
	"type" "renewal_activity_type" NOT NULL,
	"note" text,
	"outcome" text,
	"from_status" "renewal_status",
	"to_status" "renewal_status",
	"next_follow_up_at" bigint,
	"organization_id" text,
	CONSTRAINT "renewal_activities_public_id_unique" UNIQUE("public_id")
);
--> statement-breakpoint
CREATE TABLE "renewals" (
	"id" bigint PRIMARY KEY DEFAULT next_id() NOT NULL,
	"public_id" text NOT NULL,
	"app_id" bigint DEFAULT current_app_id() NOT NULL,
	"created_at" bigint NOT NULL,
	"created_by" bigint,
	"updated_at" bigint NOT NULL,
	"updated_by" bigint,
	"order_id" bigint NOT NULL,
	"status" "renewal_status",
	"lost_reason" "inquiry_lost_reason",
	"status_set_at" bigint,
	"next_follow_up_at" bigint,
	"organization_id" text,
	CONSTRAINT "renewals_public_id_unique" UNIQUE("public_id"),
	CONSTRAINT "renewals_order_id_unique" UNIQUE("order_id")
);
--> statement-breakpoint
ALTER TABLE "renewal_activities" ADD CONSTRAINT "renewal_activities_renewal_id_renewals_id_fk" FOREIGN KEY ("renewal_id") REFERENCES "public"."renewals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "renewal_activities" ADD CONSTRAINT "renewal_activities_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "renewals" ADD CONSTRAINT "renewals_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "renewals" ADD CONSTRAINT "renewals_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "renewal_activities_renewal_created_idx" ON "renewal_activities" USING btree ("renewal_id","created_at");--> statement-breakpoint
CREATE INDEX "renewals_next_follow_up_idx" ON "renewals" USING btree ("next_follow_up_at");--> statement-breakpoint
CREATE INDEX "renewals_organization_idx" ON "renewals" USING btree ("organization_id");