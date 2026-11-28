CREATE TABLE `doc_meta` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`created_by` text,
	`updated_at` integer NOT NULL,
	`updated_by` text,
	`doc_id` text NOT NULL,
	`kind` text,
	`trashed_at` integer,
	`trashed_by` text,
	FOREIGN KEY (`doc_id`) REFERENCES `collab_docs`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "doc_meta_kind_ck" CHECK(kind in ('notes','brainstorm','client'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `doc_meta_doc_uq` ON `doc_meta` (`doc_id`);