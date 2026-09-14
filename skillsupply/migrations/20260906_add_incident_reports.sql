CREATE TABLE IF NOT EXISTS incident_reports (
  incident_id SERIAL PRIMARY KEY,
  item_id INT REFERENCES inventory_items(item_id) ON DELETE SET NULL,
  incident_type VARCHAR(30) NOT NULL CHECK (incident_type IN ('Theft', 'Loss', 'Damage', 'Missing Parts', 'Expired')),
  incident_date DATE NOT NULL DEFAULT CURRENT_DATE,
  reported_by INT NOT NULL REFERENCES users(user_id),
  quantity_affected INT NOT NULL DEFAULT 1 CHECK (quantity_affected > 0),
  description TEXT NOT NULL,
  investigation_remarks TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'Open' CHECK (status IN ('Open', 'Investigating', 'Resolved', 'Closed')),
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_incident_reports_date ON incident_reports(incident_date DESC);
CREATE INDEX IF NOT EXISTS idx_incident_reports_type ON incident_reports(incident_type);
CREATE INDEX IF NOT EXISTS idx_incident_reports_item ON incident_reports(item_id);
