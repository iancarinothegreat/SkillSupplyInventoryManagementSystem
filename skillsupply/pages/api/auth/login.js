import { query } from '../../../lib/db.js';
import { signToken } from '../../../lib/auth.js';
import bcrypt from 'bcryptjs';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { username, password } = req.body;

  if (!username || !password)
    return res.status(400).json({ error: 'Username and password required' });

  try {
    const result = await query(`
      SELECT u.*, r.role_name, r.hierarchy_level
      FROM users u
      JOIN roles r ON u.role_id = r.role_id
      WHERE u.username = $1
    `, [username]);

    const user = result.rows[0];
    if (!user) {
      await query(
        `INSERT INTO login_audit (user_id, username, action, failure_reason, ip_address, user_agent)
         VALUES (NULL, $1, 'LOGIN_FAILED', 'UNKNOWN_USER', $2, $3)`,
        [username, req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || null, req.headers['user-agent'] || null]
      );
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    if (!user.is_active) {
      await query(
        `INSERT INTO login_audit (user_id, username, action, failure_reason, ip_address, user_agent)
         VALUES ($1, $2, 'LOGIN_FAILED', 'ACCOUNT_LOCKED', $3, $4)`,
        [user.user_id, user.username, req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || null, req.headers['user-agent'] || null]
      );
      return res.status(401).json({ error: 'Account is locked or inactive' });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      await query(
        `INSERT INTO login_audit (user_id, username, action, failure_reason, ip_address, user_agent)
         VALUES ($1, $2, 'LOGIN_FAILED', 'WRONG_PASSWORD', $3, $4)`,
        [user.user_id, user.username, req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || null, req.headers['user-agent'] || null]
      );
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = signToken({
      user_id: user.user_id,
      username: user.username,
      full_name: user.full_name,
      role_id: user.role_id,
      role_name: user.role_name,
      hierarchy_level: user.hierarchy_level
    });

    // Log successful login to audit trail
    const ip = req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || null;
    const userAgent = req.headers['user-agent'] || null;
    await query(
      `INSERT INTO login_audit (user_id, username, action, failure_reason, ip_address, user_agent)
       VALUES ($1, $2, 'LOGIN', NULL, $3, $4)`,
      [user.user_id, user.username, ip, userAgent]
    );

    return res.status(200).json({
      token,
      user: {
        user_id: user.user_id,
        username: user.username,
        full_name: user.full_name,
        role_name: user.role_name,
        hierarchy_level: user.hierarchy_level
      }
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
}
