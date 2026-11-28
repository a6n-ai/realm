CREATE TABLE `collab_docs` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`created_by` text,
	`updated_at` integer NOT NULL,
	`updated_by` text,
	`organization_id` text NOT NULL,
	`owner_ref` text NOT NULL,
	`title` text NOT NULL,
	`snapshot` text,
	`text` text,
	`default_link_ttl_seconds` integer DEFAULT 604800 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `collab_docs_owner_idx` ON `collab_docs` (`organization_id`,`owner_ref`);--> statement-breakpoint
CREATE TABLE `collab_shares` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`created_by` text,
	`updated_at` integer NOT NULL,
	`updated_by` text,
	`doc_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`mode` text NOT NULL,
	`expires_at` integer NOT NULL,
	`revoked_at` integer,
	FOREIGN KEY (`doc_id`) REFERENCES `collab_docs`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "collab_shares_mode_ck" CHECK(mode in ('edit','view'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `collab_shares_token_hash_uq` ON `collab_shares` (`token_hash`);--> statement-breakpoint
CREATE INDEX `collab_shares_doc_idx` ON `collab_shares` (`doc_id`);