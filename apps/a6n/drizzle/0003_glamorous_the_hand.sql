CREATE TABLE `doc_members` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`created_by` text,
	`updated_at` integer NOT NULL,
	`updated_by` text,
	`doc_id` text NOT NULL,
	`user_id` text NOT NULL,
	`mode` text NOT NULL,
	FOREIGN KEY (`doc_id`) REFERENCES `collab_docs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "doc_members_mode_ck" CHECK(mode in ('edit','view'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `doc_members_doc_user_uq` ON `doc_members` (`doc_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `doc_members_user_idx` ON `doc_members` (`user_id`);