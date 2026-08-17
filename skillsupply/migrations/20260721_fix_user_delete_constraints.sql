-- Run this SQL in your Supabase SQL Editor
-- This modifies foreign key constraints so you can delete users
-- while preserving their historical records.

-- 1. borrow_transactions.user_id - make nullable and SET NULL on delete
ALTER TABLE borrow_transactions
  DROP CONSTRAINT IF EXISTS borrow_transactions_user_id_fkey,
  ALTER COLUMN user_id DROP NOT NULL,
  ADD CONSTRAINT borrow_transactions_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE SET NULL;

-- 2. return_transactions.processed_by - SET NULL on delete
ALTER TABLE return_transactions
  DROP CONSTRAINT IF EXISTS return_transactions_processed_by_fkey,
  ADD CONSTRAINT return_transactions_processed_by_fkey
    FOREIGN KEY (processed_by) REFERENCES users(user_id) ON DELETE SET NULL;

-- 3. audit_log.user_id - SET NULL on delete
ALTER TABLE audit_log
  DROP CONSTRAINT IF EXISTS audit_log_user_id_fkey,
  ALTER COLUMN user_id DROP NOT NULL,
  ADD CONSTRAINT audit_log_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE SET NULL;

-- 4. requisitions.user_id - make nullable and SET NULL on delete
ALTER TABLE requisitions
  DROP CONSTRAINT IF EXISTS requisitions_user_id_fkey,
  ALTER COLUMN user_id DROP NOT NULL,
  ADD CONSTRAINT requisitions_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE SET NULL;

-- 5. requisitions.approved_by - SET NULL on delete
ALTER TABLE requisitions
  DROP CONSTRAINT IF EXISTS requisitions_approved_by_fkey,
  ADD CONSTRAINT requisitions_approved_by_fkey
    FOREIGN KEY (approved_by) REFERENCES users(user_id) ON DELETE SET NULL;

