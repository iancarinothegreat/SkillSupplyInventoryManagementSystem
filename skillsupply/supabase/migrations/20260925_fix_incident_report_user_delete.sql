-- Keep incident reports when the reporting user account is permanently deleted.
ALTER TABLE incident_reports
  DROP CONSTRAINT IF EXISTS incident_reports_reported_by_fkey,
  ALTER COLUMN reported_by DROP NOT NULL,
  ADD CONSTRAINT incident_reports_reported_by_fkey
    FOREIGN KEY (reported_by) REFERENCES users(user_id) ON DELETE SET NULL;

ALTER TABLE incident_reports
  DROP CONSTRAINT IF EXISTS incident_reports_reviewed_by_fkey,
  ADD CONSTRAINT incident_reports_reviewed_by_fkey
    FOREIGN KEY (reviewed_by) REFERENCES users(user_id) ON DELETE SET NULL;
