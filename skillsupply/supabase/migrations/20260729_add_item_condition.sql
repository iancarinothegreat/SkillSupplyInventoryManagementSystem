ALTER TABLE inventory_items
  ADD COLUMN IF NOT EXISTS item_condition VARCHAR(20) DEFAULT 'Working' CHECK (item_condition IN ('Working', 'Defective'));