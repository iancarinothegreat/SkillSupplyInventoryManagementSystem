-- Run this SQL in your Supabase SQL Editor
-- This fixes "Server error" when creating accounts (signup)

-- The issue: if your live users table has a division_id column 
-- with NOT NULL constraint but no default value, the signup INSERT
-- fails because it doesn't provide division_id.

-- Check if division_id exists and is NOT NULL, then make it nullable
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'users' AND column_name = 'division_id'
  ) THEN
    ALTER TABLE users ALTER COLUMN division_id DROP NOT NULL;
  END IF;
END $$;

