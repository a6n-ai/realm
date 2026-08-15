CREATE TABLE "meal_payout" (
	"id" bigint PRIMARY KEY DEFAULT next_id() NOT NULL,
	"public_id" text NOT NULL,
	"app_id" bigint DEFAULT current_app_id() NOT NULL,
	"created_at" bigint NOT NULL,
	"created_by" bigint,
	"updated_at" bigint NOT NULL,
	"updated_by" bigint,
	"meal_size_id" bigint,
	"duration_package_id" bigint,
	"coins" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "meal_payout_public_id_unique" UNIQUE("public_id")
);
--> statement-breakpoint
ALTER TABLE "meal_payout" ADD CONSTRAINT "meal_payout_meal_size_id_meal_sizes_id_fk" FOREIGN KEY ("meal_size_id") REFERENCES "public"."meal_sizes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_payout" ADD CONSTRAINT "meal_payout_duration_package_id_duration_packages_id_fk" FOREIGN KEY ("duration_package_id") REFERENCES "public"."duration_packages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "meal_payout_combo_unique" ON "meal_payout" USING btree ("meal_size_id","duration_package_id");