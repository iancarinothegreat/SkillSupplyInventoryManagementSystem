-- Procurement planning module for the Supply Officer.
-- Scope: procurement requests / planning only (no payments or budgeting).

CREATE TABLE IF NOT EXISTS procurement_requests (
  procurement_id SERIAL PRIMARY KEY,
  requested_by INT REFERENCES users(user_id) ON DELETE SET NULL,
  division_id INT REFERENCES divisions(division_id),
  status VARCHAR(20) NOT NULL DEFAULT 'Pending'
    CHECK (status IN ('Pending', 'Approved', 'Rejected', 'Received', 'Cancelled')),
  justification TEXT,
  supplier_name VARCHAR(150),
  reference_number VARCHAR(100),
  notes TEXT,
  approved_by INT REFERENCES users(user_id) ON DELETE SET NULL,
  approval_date DATE,
  approval_remarks TEXT,
  received_by INT REFERENCES users(user_id) ON DELETE SET NULL,
  received_date TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS procurement_items (
  procurement_item_id SERIAL PRIMARY KEY,
  procurement_id INT NOT NULL REFERENCES procurement_requests(procurement_id) ON DELETE CASCADE,
  item_id INT NOT NULL REFERENCES inventory_items(item_id),
  quantity_requested INT NOT NULL CHECK (quantity_requested > 0),
  quantity_received INT NOT NULL DEFAULT 0,
  unit_cost NUMERIC
);

CREATE INDEX IF NOT EXISTS idx_procurement_requests_status ON procurement_requests(status);
CREATE INDEX IF NOT EXISTS idx_procurement_requests_created ON procurement_requests(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_procurement_items_procurement_id ON procurement_items(procurement_id);
CREATE INDEX IF NOT EXISTS idx_procurement_items_item_id ON procurement_items(item_id);
