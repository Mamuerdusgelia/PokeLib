CREATE TRIGGER immutable_team_version BEFORE UPDATE ON team_versions BEGIN SELECT RAISE(ABORT, 'Historical versions are immutable'); END;
CREATE TRIGGER version_pointer_guard BEFORE UPDATE OF current_version_id ON teams WHEN NOT EXISTS (SELECT 1 FROM team_versions WHERE id=NEW.current_version_id AND team_id=NEW.id) BEGIN SELECT RAISE(ABORT, 'Invalid team version pointer'); END;
