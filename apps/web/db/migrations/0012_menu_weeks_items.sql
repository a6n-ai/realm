CREATE TYPE "public"."day_of_week" AS ENUM('mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun');--> statement-breakpoint
CREATE TYPE "public"."menu_week_status" AS ENUM('draft', 'released');--> statement-breakpoint
CREATE TABLE "menu_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"menu_week_id" uuid NOT NULL,
	"day_of_week" "day_of_week" NOT NULL,
	"slot" text NOT NULL,
	"dish_id" uuid NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "menu_weeks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"week_start" date NOT NULL,
	"status" "menu_week_status" DEFAULT 'draft' NOT NULL,
	"order_cutoff" timestamp with time zone NOT NULL,
	"released_at" timestamp with time zone,
	CONSTRAINT "menu_weeks_week_start_unique" UNIQUE("week_start")
);
--> statement-breakpoint
ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_menu_week_id_menu_weeks_id_fk" FOREIGN KEY ("menu_week_id") REFERENCES "public"."menu_weeks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_dish_id_dishes_id_fk" FOREIGN KEY ("dish_id") REFERENCES "public"."dishes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "menu_items_unique" ON "menu_items" USING btree ("menu_week_id","day_of_week","slot","dish_id");