ALTER TABLE incident_reports
  ADD COLUMN IF NOT EXISTS reviewed_by INT REFERENCES users(user_id),
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMP;
