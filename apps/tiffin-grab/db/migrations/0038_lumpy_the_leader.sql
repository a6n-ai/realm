ALTER TYPE "public"."app_event" ADD VALUE 'order_receipt';--> statement-breakpoint
CREATE INDEX "idx_fs_parent" ON "files_file_system" USING btree ("parent_id");