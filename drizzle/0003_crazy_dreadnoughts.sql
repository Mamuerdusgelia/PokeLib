CREATE INDEX `teams_owner_modified_id` ON `teams` (`owner_id`,`updated_at`,`id`);--> statement-breakpoint
CREATE INDEX `teams_owner_format_id` ON `teams` (`owner_id`,`format`,`id`);--> statement-breakpoint
CREATE INDEX `teams_owner_created_id` ON `teams` (`owner_id`,`created_at`,`id`);