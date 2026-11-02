CREATE TABLE "rate_limit" (
	"id" text PRIMARY KEY DEFAULT (next_id())::text NOT NULL,
	"key" text NOT NULL,
	"count" integer NOT NULL,
	"last_request" bigint NOT NULL,
	CONSTRAINT "rate_limit_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE INDEX "idx_fs_parent" ON "files_file_system" USING btree ("parent_id");