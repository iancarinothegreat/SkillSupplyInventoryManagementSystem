-- Migration: Add borrower_name to borrow_transactions
-- Run this in your Supabase SQL Editor or via psql

ALTER TABLE borrow_transactions
  ADD COLUMN IF NOT EXISTS borrower_name VARCHAR(150) NOT NULL DEFAULT '';

-- Update existing rows that have a user_id to populate borrower_name from users table
UPDATE borrow_transactions bt
SET borrower_name = u.full_name
FROM users u
WHERE bt.user_id = u.user_id AND bt.borrower_name = '';

-- Change default status from 'Active' to 'Borrowed'
ALTER TABLE borrow_transactions ALTER COLUMN status SET DEFAULT 'Borrowed';
