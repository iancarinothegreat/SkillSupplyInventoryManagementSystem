import { query } from '../../../lib/db.js';
import { withAuth } from '../../../lib/rbac.js';

async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  try {
    const result = await query(`
            SELECT u.user_id, u.username, u.full_name, u.email, u.contact,
              u.is_active, u.created_at, u.division_id, d.division_name,
             r.role_name, r.hierarchy_level
      FROM users u
      JOIN roles r ON u.role_id = r.role_id
      LEFT JOIN divisions d ON u.division_id = d.division_id
      WHERE u.user_id = $1 AND u.is_active = true
    `, [req.user.user_id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    return res.status(200).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
}

export default withAuth(handler, 1);
