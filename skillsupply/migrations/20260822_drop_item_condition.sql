ALTER TABLE inventory_items DROP COLUMN IF EXISTS item_condition;
DROP INDEX IF EXISTS idx_inventory_items_condition;
