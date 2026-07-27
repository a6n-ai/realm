CREATE TABLE "employees" (
	"id" bigint PRIMARY KEY DEFAULT next_id() NOT NULL,
	"public_id" text NOT NULL,
	"app_id" bigint DEFAULT current_app_id() NOT NULL,
	"created_at" bigint NOT NULL,
	"created_by" bigint,
	"updated_at" bigint NOT NULL,
	"updated_by" bigint,
	"name" text NOT NULL,
	"nickname" text,
	"email" text,
	"custom_id" text,
	"role" text,
	"is_owner" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"clover_employee_id" text,
	"clover_last_synced_at" bigint,
	CONSTRAINT "employees_public_id_unique" UNIQUE("public_id"),
	CONSTRAINT "employees_clover_employee_id_unique" UNIQUE("clover_employee_id")
);
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "assigned_employee_id" bigint;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_assigned_employee_id_employees_id_fk" FOREIGN KEY ("assigned_employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "orders_assigned_employee_idx" ON "orders" USING btree ("assigned_employee_id");
