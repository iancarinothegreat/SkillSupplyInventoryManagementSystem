-- Keep login history when a user account is permanently deleted.
-- user_id is nullable so historical rows can remain queryable by username.
ALTER TABLE login_audit
  DROP CONSTRAINT IF EXISTS login_audit_user_id_fkey,
  ADD CONSTRAINT login_audit_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE SET NULL;
