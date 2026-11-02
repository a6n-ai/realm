CREATE TABLE "list_filter_usage" (
	"id" bigint PRIMARY KEY DEFAULT next_id() NOT NULL,
	"public_id" text NOT NULL,
	"app_id" bigint DEFAULT current_app_id() NOT NULL,
	"created_at" bigint NOT NULL,
	"created_by" bigint,
	"user_id" bigint NOT NULL,
	"organization_id" text,
	"path" text NOT NULL,
	"params" text NOT NULL,
	"uses" integer DEFAULT 1 NOT NULL,
	"last_used_at" bigint NOT NULL,
	CONSTRAINT "list_filter_usage_public_id_unique" UNIQUE("public_id")
);
--> statement-breakpoint
ALTER TABLE "list_filter_usage" ADD CONSTRAINT "list_filter_usage_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "list_filter_usage" ADD CONSTRAINT "list_filter_usage_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "list_filter_usage_user_path_params_idx" ON "list_filter_usage" USING btree ("user_id","path","params");--> statement-breakpoint
CREATE INDEX "list_filter_usage_org_path_idx" ON "list_filter_usage" USING btree ("organization_id","path");