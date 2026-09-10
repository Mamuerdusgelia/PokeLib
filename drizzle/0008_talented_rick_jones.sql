CREATE TABLE `backup_generations` (
	`owner_id` text PRIMARY KEY NOT NULL,
	`generation` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `backup_restores` (
	`id` text NOT NULL,
	`owner_id` text NOT NULL,
	`state` text NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`owner_id`, `id`)
);

--> statement-breakpoint
CREATE TRIGGER backup_generation_teams_insert AFTER INSERT ON teams
WHEN new.owner_id IS NOT NULL
BEGIN INSERT INTO backup_generations(owner_id,generation) VALUES(new.owner_id,1)
ON CONFLICT(owner_id) DO UPDATE SET generation=generation+1; END;

--> statement-breakpoint
CREATE TRIGGER backup_generation_teams_update AFTER UPDATE ON teams
WHEN new.owner_id IS NOT NULL
BEGIN INSERT INTO backup_generations(owner_id,generation) VALUES(new.owner_id,1)
ON CONFLICT(owner_id) DO UPDATE SET generation=generation+1; END;

--> statement-breakpoint
CREATE TRIGGER backup_generation_teams_delete AFTER DELETE ON teams
WHEN old.owner_id IS NOT NULL
BEGIN INSERT INTO backup_generations(owner_id,generation) VALUES(old.owner_id,1)
ON CONFLICT(owner_id) DO UPDATE SET generation=generation+1; END;

--> statement-breakpoint
CREATE TRIGGER backup_generation_team_families_insert AFTER INSERT ON team_families
WHEN new.owner_id IS NOT NULL
BEGIN INSERT INTO backup_generations(owner_id,generation) VALUES(new.owner_id,1)
ON CONFLICT(owner_id) DO UPDATE SET generation=generation+1; END;

--> statement-breakpoint
CREATE TRIGGER backup_generation_team_families_update AFTER UPDATE ON team_families
WHEN new.owner_id IS NOT NULL
BEGIN INSERT INTO backup_generations(owner_id,generation) VALUES(new.owner_id,1)
ON CONFLICT(owner_id) DO UPDATE SET generation=generation+1; END;

--> statement-breakpoint
CREATE TRIGGER backup_generation_team_families_delete AFTER DELETE ON team_families
WHEN old.owner_id IS NOT NULL
BEGIN INSERT INTO backup_generations(owner_id,generation) VALUES(old.owner_id,1)
ON CONFLICT(owner_id) DO UPDATE SET generation=generation+1; END;

--> statement-breakpoint
CREATE TRIGGER backup_generation_tags_insert AFTER INSERT ON tags
WHEN new.owner_id IS NOT NULL
BEGIN INSERT INTO backup_generations(owner_id,generation) VALUES(new.owner_id,1)
ON CONFLICT(owner_id) DO UPDATE SET generation=generation+1; END;

--> statement-breakpoint
CREATE TRIGGER backup_generation_tags_update AFTER UPDATE ON tags
WHEN new.owner_id IS NOT NULL
BEGIN INSERT INTO backup_generations(owner_id,generation) VALUES(new.owner_id,1)
ON CONFLICT(owner_id) DO UPDATE SET generation=generation+1; END;

--> statement-breakpoint
CREATE TRIGGER backup_generation_tags_delete AFTER DELETE ON tags
WHEN old.owner_id IS NOT NULL
BEGIN INSERT INTO backup_generations(owner_id,generation) VALUES(old.owner_id,1)
ON CONFLICT(owner_id) DO UPDATE SET generation=generation+1; END;

--> statement-breakpoint
CREATE TRIGGER backup_generation_collections_insert AFTER INSERT ON collections
WHEN new.owner_id IS NOT NULL
BEGIN INSERT INTO backup_generations(owner_id,generation) VALUES(new.owner_id,1)
ON CONFLICT(owner_id) DO UPDATE SET generation=generation+1; END;

--> statement-breakpoint
CREATE TRIGGER backup_generation_collections_update AFTER UPDATE ON collections
WHEN new.owner_id IS NOT NULL
BEGIN INSERT INTO backup_generations(owner_id,generation) VALUES(new.owner_id,1)
ON CONFLICT(owner_id) DO UPDATE SET generation=generation+1; END;

--> statement-breakpoint
CREATE TRIGGER backup_generation_collections_delete AFTER DELETE ON collections
WHEN old.owner_id IS NOT NULL
BEGIN INSERT INTO backup_generations(owner_id,generation) VALUES(old.owner_id,1)
ON CONFLICT(owner_id) DO UPDATE SET generation=generation+1; END;

--> statement-breakpoint
CREATE TRIGGER backup_generation_team_versions_insert AFTER INSERT ON team_versions
WHEN (SELECT owner_id FROM teams WHERE id=new.team_id) IS NOT NULL
BEGIN INSERT INTO backup_generations(owner_id,generation) VALUES((SELECT owner_id FROM teams WHERE id=new.team_id),1)
ON CONFLICT(owner_id) DO UPDATE SET generation=generation+1; END;

--> statement-breakpoint
CREATE TRIGGER backup_generation_team_versions_update AFTER UPDATE ON team_versions
WHEN (SELECT owner_id FROM teams WHERE id=new.team_id) IS NOT NULL
BEGIN INSERT INTO backup_generations(owner_id,generation) VALUES((SELECT owner_id FROM teams WHERE id=new.team_id),1)
ON CONFLICT(owner_id) DO UPDATE SET generation=generation+1; END;

--> statement-breakpoint
CREATE TRIGGER backup_generation_team_versions_delete AFTER DELETE ON team_versions
WHEN (SELECT owner_id FROM teams WHERE id=old.team_id) IS NOT NULL
BEGIN INSERT INTO backup_generations(owner_id,generation) VALUES((SELECT owner_id FROM teams WHERE id=old.team_id),1)
ON CONFLICT(owner_id) DO UPDATE SET generation=generation+1; END;

--> statement-breakpoint
CREATE TRIGGER backup_generation_team_tags_insert AFTER INSERT ON team_tags
WHEN (SELECT owner_id FROM teams WHERE id=new.team_id) IS NOT NULL
BEGIN INSERT INTO backup_generations(owner_id,generation) VALUES((SELECT owner_id FROM teams WHERE id=new.team_id),1)
ON CONFLICT(owner_id) DO UPDATE SET generation=generation+1; END;

--> statement-breakpoint
CREATE TRIGGER backup_generation_team_tags_update AFTER UPDATE ON team_tags
WHEN (SELECT owner_id FROM teams WHERE id=new.team_id) IS NOT NULL
BEGIN INSERT INTO backup_generations(owner_id,generation) VALUES((SELECT owner_id FROM teams WHERE id=new.team_id),1)
ON CONFLICT(owner_id) DO UPDATE SET generation=generation+1; END;

--> statement-breakpoint
CREATE TRIGGER backup_generation_team_tags_delete AFTER DELETE ON team_tags
WHEN (SELECT owner_id FROM teams WHERE id=old.team_id) IS NOT NULL
BEGIN INSERT INTO backup_generations(owner_id,generation) VALUES((SELECT owner_id FROM teams WHERE id=old.team_id),1)
ON CONFLICT(owner_id) DO UPDATE SET generation=generation+1; END;

--> statement-breakpoint
CREATE INDEX backup_teams_order ON teams(owner_id,coalesce(family_id,id),id);
