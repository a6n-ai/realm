CREATE TABLE "trial_settings" (
	"id" bigint PRIMARY KEY DEFAULT next_id() NOT NULL,
	"public_id" text NOT NULL,
	"app_id" bigint DEFAULT current_app_id() NOT NULL,
	"created_at" bigint NOT NULL,
	"created_by" bigint,
	"updated_at" bigint NOT NULL,
	"updated_by" bigint,
	"delivery_frequency_id" bigint,
	"max_days" integer,
	"organization_id" text,
	CONSTRAINT "trial_settings_public_id_unique" UNIQUE("public_id"),
	CONSTRAINT "trial_settings_organization_unique" UNIQUE NULLS NOT DISTINCT("organization_id")
);
--> statement-breakpoint
ALTER TABLE "trial_settings" ADD CONSTRAINT "trial_settings_delivery_frequency_id_delivery_frequencies_id_fk" FOREIGN KEY ("delivery_frequency_id") REFERENCES "public"."delivery_frequencies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trial_settings" ADD CONSTRAINT "trial_settings_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app" DROP COLUMN "trial_max_days";--> statement-breakpoint
ALTER TABLE "app" DROP COLUMN "trial_weekdays";