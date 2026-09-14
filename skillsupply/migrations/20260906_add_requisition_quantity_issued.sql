ALTER TABLE requisition_items
  ADD COLUMN IF NOT EXISTS quantity_issued INT NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_requisition_items_status
  ON requisition_items(status);