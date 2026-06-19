CREATE TYPE "public"."inquiry_activity_type" AS ENUM('created', 'note', 'stage_change', 'converted');--> statement-breakpoint
CREATE TYPE "public"."inquiry_source" AS ENUM('website', 'facebook', 'google', 'manual', 'referral');--> statement-breakpoint
CREATE TYPE "public"."inquiry_stage" AS ENUM('new', 'contacted', 'follow_up', 'converted', 'lost');--> statement-breakpoint
CREATE TABLE "inquiries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"full_name" text NOT NULL,
	"phone" text NOT NULL,
	"email" text,
	"source" "inquiry_source" DEFAULT 'manual' NOT NULL,
	"stage" "inquiry_stage" DEFAULT 'new' NOT NULL,
	"assigned_to" uuid,
	"converted_order_id" uuid,
	"prefs" jsonb,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "inquiry_activities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"inquiry_id" uuid NOT NULL,
	"type" "inquiry_activity_type" NOT NULL,
	"note" text,
	"from_stage" "inquiry_stage",
	"to_stage" "inquiry_stage"
);
--> statement-breakpoint
ALTER TABLE "inquiries" ADD CONSTRAINT "inquiries_assigned_to_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inquiries" ADD CONSTRAINT "inquiries_converted_order_id_orders_id_fk" FOREIGN KEY ("converted_order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inquiry_activities" ADD CONSTRAINT "inquiry_activities_inquiry_id_inquiries_id_fk" FOREIGN KEY ("inquiry_id") REFERENCES "public"."inquiries"("id") ON DELETE cascade ON UPDATE no action;