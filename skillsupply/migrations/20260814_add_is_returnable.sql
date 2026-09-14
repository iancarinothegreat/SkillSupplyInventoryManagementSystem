ALTER TABLE inventory_items
  ADD COLUMN IF NOT EXISTS is_returnable BOOLEAN DEFAULT TRUE;

UPDATE inventory_items SET is_returnable = TRUE WHERE is_returnable IS NULL;
