ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS entry_hash VARCHAR(64);
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS previous_hash VARCHAR(64);

CREATE INDEX IF NOT EXISTS idx_audit_log_entry_hash ON audit_log(entry_hash);
CREATE INDEX IF NOT EXISTS idx_audit_log_previous_hash ON audit_log(previous_hash);
