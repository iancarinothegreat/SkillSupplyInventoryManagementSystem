-- Classify items by borrowing rules: borrowable / returnable / max days to borrow.

ALTER TABLE inventory_items
  ADD COLUMN IF NOT EXISTS is_borrowable BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE inventory_items
  ADD COLUMN IF NOT EXISTS maximum_borrow_days INT;

COMMENT ON COLUMN inventory_items.is_borrowable IS 'Whether the item may be borrowed at all.';
COMMENT ON COLUMN inventory_items.is_returnable IS 'Whether the item must be returned after borrowing.';
COMMENT ON COLUMN inventory_items.maximum_borrow_days IS 'Maximum number of days the item may be borrowed (NULL = unlimited).';
