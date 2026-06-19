CREATE TABLE "meal_selections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"order_id" uuid NOT NULL,
	"menu_week_id" uuid NOT NULL,
	"day_of_week" "day_of_week" NOT NULL,
	"slot" text NOT NULL,
	"person_index" integer NOT NULL,
	"dish_id" uuid NOT NULL
);
--> statement-breakpoint
ALTER TABLE "meal_selections" ADD CONSTRAINT "meal_selections_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_selections" ADD CONSTRAINT "meal_selections_menu_week_id_menu_weeks_id_fk" FOREIGN KEY ("menu_week_id") REFERENCES "public"."menu_weeks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_selections" ADD CONSTRAINT "meal_selections_dish_id_dishes_id_fk" FOREIGN KEY ("dish_id") REFERENCES "public"."dishes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "meal_selections_unique" ON "meal_selections" USING btree ("order_id","menu_week_id","day_of_week","slot","person_index");