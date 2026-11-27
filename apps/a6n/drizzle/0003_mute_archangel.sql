DROP INDEX `companies_name_key_uq`;--> statement-breakpoint
CREATE UNIQUE INDEX `companies_org_name_key_uq` ON `companies` (`organization_id`,`name_key`);--> statement-breakpoint
DROP INDEX `invites_user_n_uq`;--> statement-breakpoint
CREATE UNIQUE INDEX `invites_user_org_n_uq` ON `invites` (`user_id`,`organization_id`,`n`);--> statement-breakpoint
DROP INDEX `lead_sources_key_uq`;--> statement-breakpoint
CREATE UNIQUE INDEX `lead_sources_org_key_uq` ON `lead_sources` (`organization_id`,`key`);