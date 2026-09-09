-- No snapshot data is rewritten. Missing edit_revision falls back to the row id.
DROP TRIGGER immutable_team_version;
--> statement-breakpoint
CREATE TRIGGER immutable_team_version BEFORE UPDATE ON team_versions
WHEN NOT EXISTS (SELECT 1 FROM teams WHERE id=OLD.team_id AND current_version_id=OLD.id)
BEGIN SELECT RAISE(ABORT, 'Historical versions are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER current_version_identity_guard BEFORE UPDATE ON team_versions
WHEN NEW.id IS NOT OLD.id OR NEW.team_id IS NOT OLD.team_id
 OR NEW.version_number IS NOT OLD.version_number OR NEW.created_at IS NOT OLD.created_at
 OR json_extract(NEW.snapshot,'$.id') IS NOT json_extract(OLD.snapshot,'$.id')
 OR json_extract(NEW.snapshot,'$.team_id') IS NOT json_extract(OLD.snapshot,'$.team_id')
 OR json_extract(NEW.snapshot,'$.version_number') IS NOT json_extract(OLD.snapshot,'$.version_number')
 OR json_extract(NEW.snapshot,'$.parent_version_id') IS NOT json_extract(OLD.snapshot,'$.parent_version_id')
 OR json_extract(NEW.snapshot,'$.created_at') IS NOT json_extract(OLD.snapshot,'$.created_at')
 OR json_extract(NEW.snapshot,'$.original_text') IS NOT json_extract(OLD.snapshot,'$.original_text')
 OR json_extract(NEW.snapshot,'$.version_comment') IS NOT json_extract(OLD.snapshot,'$.version_comment')
 OR json_type(NEW.snapshot,'$.edit_revision') IS NOT 'text'
 OR length(json_extract(NEW.snapshot,'$.edit_revision'))=0
 OR json_extract(NEW.snapshot,'$.edit_revision') IS coalesce(json_extract(OLD.snapshot,'$.edit_revision'),OLD.id)
BEGIN SELECT RAISE(ABORT, 'Current version identity is immutable; saves require a new edit revision'); END;
--> statement-breakpoint
DROP TRIGGER version_pointer_guard;
--> statement-breakpoint
CREATE TRIGGER version_pointer_guard BEFORE UPDATE OF current_version_id ON teams
WHEN NEW.current_version_id IS NOT OLD.current_version_id AND NOT EXISTS (
 SELECT 1 FROM team_versions next JOIN team_versions previous ON previous.id=OLD.current_version_id AND previous.team_id=OLD.id
 WHERE next.id=NEW.current_version_id AND next.team_id=NEW.id AND next.version_number>previous.version_number
)
BEGIN SELECT RAISE(ABORT, 'Invalid team version pointer: historical versions cannot become current'); END;
