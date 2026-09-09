-- Drizzle's SQLite generator incorrectly quotes/splits expressions containing commas.
CREATE INDEX teams_owner_effective_family ON teams(owner_id,coalesce(family_id,id));
--> statement-breakpoint
CREATE TRIGGER variant_family_namespace BEFORE INSERT ON teams
WHEN new.family_id IS NULL AND EXISTS(SELECT 1 FROM team_families WHERE id=new.id)
BEGIN SELECT RAISE(ABORT,'This ID already belongs to a team family.'); END;
