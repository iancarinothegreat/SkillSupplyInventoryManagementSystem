ALTER TABLE inventory_items
  ADD COLUMN IF NOT EXISTS defective_quantity INT NOT NULL DEFAULT 0;
