-- Align the original Database.sql audit schema with the application API.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'audit_log' AND column_name = 'action_type')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'audit_log' AND column_name = 'action') THEN
    ALTER TABLE audit_log RENAME COLUMN action_type TO action;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'audit_log' AND column_name = 'affected_table')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'audit_log' AND column_name = 'table_name') THEN
    ALTER TABLE audit_log RENAME COLUMN affected_table TO table_name;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'audit_log' AND column_name = 'affected_record_id')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'audit_log' AND column_name = 'record_id') THEN
    ALTER TABLE audit_log RENAME COLUMN affected_record_id TO record_id;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'audit_log' AND column_name = 'old_value')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'audit_log' AND column_name = 'old_values') THEN
    ALTER TABLE audit_log RENAME COLUMN old_value TO old_values;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'audit_log' AND column_name = 'new_value')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'audit_log' AND column_name = 'new_values') THEN
    ALTER TABLE audit_log RENAME COLUMN new_value TO new_values;
  END IF;
END $$;
