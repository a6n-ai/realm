ALTER TYPE "public"."app_event" ADD VALUE 'holiday_declared';--> statement-breakpoint
ALTER TYPE "public"."app_event" ADD VALUE 'holiday_removed';--> statement-breakpoint
CREATE TABLE "holidays" (
	"id" bigint PRIMARY KEY DEFAULT next_id() NOT NULL,
	"public_id" text NOT NULL,
	"app_id" bigint DEFAULT current_app_id() NOT NULL,
	"created_at" bigint NOT NULL,
	"created_by" bigint,
	"updated_at" bigint NOT NULL,
	"updated_by" bigint,
	"organization_id" text NOT NULL,
	"date" date NOT NULL,
	"name" text NOT NULL,
	"notified_at" bigint,
	CONSTRAINT "holidays_public_id_unique" UNIQUE("public_id")
);
--> statement-breakpoint
ALTER TABLE "deliveries" ADD COLUMN "holiday_id" bigint;--> statement-breakpoint
ALTER TABLE "deliveries" ADD COLUMN "holiday_extra_for_delivery_id" bigint;--> statement-breakpoint
ALTER TABLE "holidays" ADD CONSTRAINT "holidays_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "holidays_organization_date_unique" ON "holidays" USING btree ("organization_id","date");--> statement-breakpoint
CREATE INDEX "holidays_date_idx" ON "holidays" USING btree ("date");--> statement-breakpoint
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_holiday_id_holidays_id_fk" FOREIGN KEY ("holiday_id") REFERENCES "public"."holidays"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_holiday_extra_for_delivery_id_deliveries_id_fk" FOREIGN KEY ("holiday_extra_for_delivery_id") REFERENCES "public"."deliveries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "deliveries_holiday_idx" ON "deliveries" USING btree ("holiday_id") WHERE "deliveries"."holiday_id" is not null;--> statement-breakpoint
CREATE INDEX "deliveries_holiday_extra_for_idx" ON "deliveries" USING btree ("holiday_extra_for_delivery_id") WHERE "deliveries"."holiday_extra_for_delivery_id" is not null;