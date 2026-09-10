CREATE TABLE `collection_shares` (
	`id` text PRIMARY KEY NOT NULL,
	`collection_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`mode` text DEFAULT 'live' NOT NULL,
	`created_at` text NOT NULL,
	`revoked_at` text,
	FOREIGN KEY (`collection_id`) REFERENCES `collections`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `collection_share_hash` ON `collection_shares` (`token_hash`);--> statement-breakpoint
CREATE INDEX `collection_share_collection` ON `collection_shares` (`collection_id`);--> statement-breakpoint
CREATE TABLE `collections` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`name` text NOT NULL,
	`name_key` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`definition` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `collections_owner_name` ON `collections` (`owner_id`,`name_key`);--> statement-breakpoint
CREATE INDEX `collections_owner_updated` ON `collections` (`owner_id`,`updated_at`,`id`);