CREATE TABLE "files_access_path" (
	"id" bigint PRIMARY KEY DEFAULT next_id() NOT NULL,
	"public_id" text NOT NULL,
	"app_id" bigint DEFAULT current_app_id() NOT NULL,
	"created_at" bigint NOT NULL,
	"created_by" bigint,
	"updated_at" bigint NOT NULL,
	"updated_by" bigint,
	"resource_type" "file_resource_type" DEFAULT 'static' NOT NULL,
	"access_name" text,
	"write_access" boolean DEFAULT false NOT NULL,
	"path" text DEFAULT '' NOT NULL,
	"allow_sub_path_access" boolean DEFAULT true NOT NULL,
	CONSTRAINT "files_access_path_public_id_unique" UNIQUE("public_id")
);
--> statement-breakpoint
CREATE TABLE "files_secured_access_key" (
	"id" bigint PRIMARY KEY DEFAULT next_id() NOT NULL,
	"public_id" text NOT NULL,
	"app_id" bigint DEFAULT current_app_id() NOT NULL,
	"created_at" bigint NOT NULL,
	"created_by" bigint,
	"updated_at" bigint NOT NULL,
	"updated_by" bigint,
	"path" text NOT NULL,
	"access_key" text NOT NULL,
	"access_till" bigint NOT NULL,
	"access_limit" bigint,
	"accessed_count" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "files_secured_access_key_public_id_unique" UNIQUE("public_id"),
	CONSTRAINT "files_secured_access_key_access_key_unique" UNIQUE("access_key")
);
