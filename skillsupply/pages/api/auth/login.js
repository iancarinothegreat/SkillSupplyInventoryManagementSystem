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
      WHERE u.username = $1 AND u.is_active = true
    `, [username]);

    const user = result.rows[0];
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

    const token = signToken({
      user_id: user.user_id,
      username: user.username,
      full_name: user.full_name,
      role_id: user.role_id,
      role_name: user.role_name,
      hierarchy_level: user.hierarchy_level
    });

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