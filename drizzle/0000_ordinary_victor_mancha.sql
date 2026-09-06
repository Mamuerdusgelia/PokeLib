CREATE TABLE `profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `search_terms` (
	`team_id` text NOT NULL,
	`version_id` text NOT NULL,
	`slot` integer NOT NULL,
	`field` text NOT NULL,
	`value` text NOT NULL,
	PRIMARY KEY(`team_id`, `version_id`, `slot`, `field`, `value`),
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `terms_lookup` ON `search_terms` (`field`,`value`,`team_id`,`version_id`,`slot`);--> statement-breakpoint
CREATE TABLE `share_links` (
	`id` text PRIMARY KEY NOT NULL,
	`team_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`created_at` text NOT NULL,
	`revoked_at` text,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `share_hash` ON `share_links` (`token_hash`);--> statement-breakpoint
CREATE INDEX `share_team` ON `share_links` (`team_id`);--> statement-breakpoint
CREATE TABLE `tags` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`display_name` text NOT NULL,
	`normalized_name` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tags_owner_name` ON `tags` (`owner_id`,`normalized_name`);--> statement-breakpoint
CREATE TABLE `team_tags` (
	`team_id` text NOT NULL,
	`tag_id` text NOT NULL,
	PRIMARY KEY(`team_id`, `tag_id`),
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tag_id`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `teams` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`title` text NOT NULL,
	`format` text NOT NULL,
	`team_date` text,
	`source_name` text NOT NULL,
	`metadata` text NOT NULL,
	`current_version_id` text NOT NULL,
	`favourite` integer DEFAULT 0 NOT NULL,
	`archived` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`imported_at` text
);
--> statement-breakpoint
CREATE INDEX `teams_owner_updated` ON `teams` (`owner_id`,`archived`,`updated_at`);--> statement-breakpoint
CREATE INDEX `teams_owner_date` ON `teams` (`owner_id`,`team_date`);--> statement-breakpoint
CREATE INDEX `teams_owner_title` ON `teams` (`owner_id`,`title`);--> statement-breakpoint
CREATE TABLE `team_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`team_id` text NOT NULL,
	`version_number` integer NOT NULL,
	`snapshot` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `versions_team_number` ON `team_versions` (`team_id`,`version_number`);--> statement-breakpoint
CREATE UNIQUE INDEX `versions_team_id` ON `team_versions` (`team_id`,`id`);