-- Migration: make email required (NOT NULL) on users table
-- Run this in your Supabase SQL editor

-- First update any existing rows with NULL email to a placeholder so the constraint can be applied
-- (You should manually fix these before running if any are real users without email)
UPDATE users SET email = CONCAT(username, '@noemail.local') WHERE email IS NULL;

-- Then enforce NOT NULL
ALTER TABLE users
  ALTER COLUMN email SET NOT NULL;
