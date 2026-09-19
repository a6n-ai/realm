CREATE TYPE "public"."file_resource_type" AS ENUM('static', 'secured');--> statement-breakpoint
CREATE TYPE "public"."file_system_node_type" AS ENUM('file', 'directory');--> statement-breakpoint
CREATE TABLE "files_file_system" (
	"id" bigint PRIMARY KEY DEFAULT next_id() NOT NULL,
	"public_id" text NOT NULL,
	"app_id" bigint DEFAULT current_app_id() NOT NULL,
	"created_at" bigint NOT NULL,
	"created_by" bigint,
	"updated_at" bigint NOT NULL,
	"updated_by" bigint,
	"resource_type" "file_resource_type" DEFAULT 'static' NOT NULL,
	"name" text NOT NULL,
	"file_type" "file_system_node_type" DEFAULT 'file' NOT NULL,
	"size" bigint,
	"parent_id" bigint,
	"path" text DEFAULT '' NOT NULL,
	CONSTRAINT "files_file_system_public_id_unique" UNIQUE("public_id")
);--> statement-breakpoint
ALTER TABLE "files_file_system" ADD CONSTRAINT "files_file_system_parent_id_files_file_system_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."files_file_system"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_fs_rtype_ftype_parent" ON "files_file_system" USING btree ("resource_type","file_type","parent_id");--> statement-breakpoint
CREATE INDEX "idx_fs_rtype_ftype" ON "files_file_system" USING btree ("resource_type","file_type");--> statement-breakpoint
CREATE INDEX "idx_fs_path" ON "files_file_system" USING btree ("path");--> statement-breakpoint
ALTER TABLE "studio_sessions" ADD COLUMN "photos" text[] DEFAULT '{}'::text[] NOT NULL;
