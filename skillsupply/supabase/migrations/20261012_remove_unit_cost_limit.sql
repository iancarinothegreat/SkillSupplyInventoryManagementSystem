-- Allow unit prices above the previous NUMERIC(10,2) limit.
ALTER TABLE inventory_items
  ALTER COLUMN unit_cost TYPE NUMERIC
  USING unit_cost::NUMERIC;
