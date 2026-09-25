ALTER TABLE users
  ADD COLUMN IF NOT EXISTS reset_token VARCHAR(128),
  ADD COLUMN IF NOT EXISTS reset_expires_at TIMESTAMP WITH TIME ZONE;

CREATE INDEX IF NOT EXISTS idx_users_reset_token
  ON users(reset_token) WHERE reset_token IS NOT NULL;
