CREATE TABLE IF NOT EXISTS login_audit (
  id SERIAL PRIMARY KEY,
  user_id INT REFERENCES users(user_id),
  username VARCHAR(100) NOT NULL,
  action VARCHAR(20) NOT NULL,
  login_time TIMESTAMP DEFAULT NOW(),
  logout_time TIMESTAMP,
  ip_address VARCHAR(45),
  user_agent TEXT
);

CREATE INDEX IF NOT EXISTS idx_login_audit_user_id ON login_audit(user_id);
CREATE INDEX IF NOT EXISTS idx_login_audit_login_time ON login_audit(login_time DESC);
CREATE INDEX IF NOT EXISTS idx_login_audit_action ON login_audit(action);
