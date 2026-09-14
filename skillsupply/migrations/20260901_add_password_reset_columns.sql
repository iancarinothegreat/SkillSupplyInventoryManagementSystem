-- Migration: add password reset columns to users table
-- Run this in your Supabase SQL editor

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS reset_token VARCHAR(128),
  ADD COLUMN IF NOT EXISTS reset_expires_at TIMESTAMP WITH TIME ZONE;

-- Optional: index for fast lookups during reset verification
CREATE INDEX IF NOT EXISTS idx_users_reset_token ON users(reset_token) WHERE reset_token IS NOT NULL;
