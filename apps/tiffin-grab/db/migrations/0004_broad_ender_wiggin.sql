CREATE TABLE "subscription_pauses" (
	"id" bigint PRIMARY KEY DEFAULT next_id() NOT NULL,
	"public_id" text NOT NULL,
	"app_id" bigint DEFAULT current_app_id() NOT NULL,
	"created_at" bigint NOT NULL,
	"created_by" bigint,
	"order_id" bigint NOT NULL,
	"from_date" date NOT NULL,
	"until_date" date NOT NULL,
	"is_indefinite" boolean DEFAULT false NOT NULL,
	"resumed_at" timestamp with time zone,
	"resumed_by" bigint,
	CONSTRAINT "subscription_pauses_public_id_unique" UNIQUE("public_id")
);
--> statement-breakpoint
ALTER TABLE "duration_packages" ADD COLUMN "max_pauses" integer;--> statement-breakpoint
ALTER TABLE "duration_packages" ADD COLUMN "max_pause_days_total" integer;--> statement-breakpoint
ALTER TABLE "duration_packages" ADD COLUMN "max_pause_stretch_days" integer;--> statement-breakpoint
ALTER TABLE "app" ADD COLUMN "default_max_pauses" integer;--> statement-breakpoint
ALTER TABLE "app" ADD COLUMN "default_max_pause_days_total" integer;--> statement-breakpoint
ALTER TABLE "app" ADD COLUMN "default_max_pause_stretch_days" integer;--> statement-breakpoint
ALTER TABLE "subscription_pauses" ADD CONSTRAINT "subscription_pauses_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_pauses" ADD CONSTRAINT "subscription_pauses_resumed_by_users_id_fk" FOREIGN KEY ("resumed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "subscription_pauses_order_idx" ON "subscription_pauses" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "subscription_pauses_open_idx" ON "subscription_pauses" USING btree ("order_id") WHERE resumed_at is null;