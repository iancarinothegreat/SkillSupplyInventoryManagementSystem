-- Memorandum Receipt (MR): indicate whether an item requires an MR receipt
-- and record the MR details whenever property is issued or borrowed.

ALTER TABLE inventory_items
  ADD COLUMN IF NOT EXISTS requires_mr BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE borrow_transactions
  ADD COLUMN IF NOT EXISTS mr_number VARCHAR(50),
  ADD COLUMN IF NOT EXISTS mr_date DATE;

ALTER TABLE requisitions
  ADD COLUMN IF NOT EXISTS mr_number VARCHAR(50),
  ADD COLUMN IF NOT EXISTS mr_date DATE;
