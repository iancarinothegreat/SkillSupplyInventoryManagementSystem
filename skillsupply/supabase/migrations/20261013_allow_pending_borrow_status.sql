-- Allow borrow requests to wait for supply officer or administrator review.
ALTER TABLE borrow_transactions
  DROP CONSTRAINT IF EXISTS borrow_transactions_status_check;

ALTER TABLE borrow_transactions
  ADD CONSTRAINT borrow_transactions_status_check
  CHECK (status IN ('Pending', 'Borrowed', 'Overdue', 'Returned', 'Cancelled', 'Active', 'Issued'));
