ALTER TABLE borrow_transactions
  ADD COLUMN IF NOT EXISTS requisition_id INT REFERENCES requisitions(requisition_id);

CREATE INDEX IF NOT EXISTS idx_borrow_transactions_requisition_id
  ON borrow_transactions(requisition_id);

ALTER TABLE requisitions DROP CONSTRAINT IF EXISTS requisitions_status_check;
ALTER TABLE requisitions
  ADD CONSTRAINT requisitions_status_check
  CHECK (status IN ('Pending', 'Approved', 'Rejected', 'Issued', 'Returned'));
