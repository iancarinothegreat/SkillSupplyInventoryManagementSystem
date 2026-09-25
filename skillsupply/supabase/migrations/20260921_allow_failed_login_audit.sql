ALTER TABLE login_audit
  ALTER COLUMN user_id DROP NOT NULL;

ALTER TABLE login_audit
  ADD COLUMN IF NOT EXISTS failure_reason VARCHAR(40);
