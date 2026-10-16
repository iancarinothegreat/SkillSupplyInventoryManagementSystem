-- Per-division request limit for splittable items.
-- NULL = no limit. When set, a division cannot have more than this
-- quantity of the item across released requisitions + active borrows.
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS per_division_limit INTEGER;
