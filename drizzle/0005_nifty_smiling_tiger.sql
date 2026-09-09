CREATE TABLE `team_families` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`title` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
ALTER TABLE `teams` ADD `family_id` text REFERENCES team_families(id) ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE `teams` ADD `variant_name` text DEFAULT 'Main' NOT NULL;--> statement-breakpoint
ALTER TABLE `teams` ADD `variant_key` text DEFAULT 'main' NOT NULL;--> statement-breakpoint
ALTER TABLE `teams` ADD `variant_description` text DEFAULT '' NOT NULL;--> statement-breakpoint
CREATE INDEX `teams_owner_family` ON `teams` (`owner_id`,`family_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `variants_family_name` ON `teams` (`family_id`,`variant_key`);
--> statement-breakpoint
CREATE TRIGGER variant_family_insert BEFORE INSERT ON teams
WHEN new.family_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM team_families f WHERE f.id=new.family_id AND f.owner_id=new.owner_id AND f.title=new.title AND f.title=json_extract(new.metadata,'$.title'))
BEGIN SELECT RAISE(ABORT,'Invalid family ownership or title. Use Rename team family.'); END;
--> statement-breakpoint
CREATE TRIGGER variant_family_update BEFORE UPDATE ON teams
WHEN (old.family_id IS NOT NULL AND new.family_id IS NOT old.family_id) OR
(new.family_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM team_families f WHERE f.id=new.family_id AND f.owner_id=new.owner_id AND f.title=new.title AND f.title=json_extract(new.metadata,'$.title')))
BEGIN SELECT RAISE(ABORT,'Invalid family ownership or title. Use Rename team family.'); END;
--> statement-breakpoint
CREATE TRIGGER variant_last_delete BEFORE DELETE ON teams
WHEN old.family_id IS NOT NULL AND EXISTS(SELECT 1 FROM team_families WHERE id=old.family_id)
AND (SELECT count(*) FROM teams WHERE family_id=old.family_id)=1
BEGIN SELECT RAISE(ABORT,'Use Delete team family to delete the final variant.'); END;
