import { query } from '../../../lib/db.js';
import { withAuth } from '../../../lib/rbac.js';
import bcrypt from 'bcryptjs';

const FULL_NAME_PATTERN = /^[A-Za-zÀ-ÖØ-öø-ÿñÑ '.\\-]+$/;

function normalizeFullName(value) {
  return String(value ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

async function validateRoleForDivision(role_id, division_id) {
  const roleId = Number(role_id);
  if (![1, 2, 3].includes(roleId)) return 'Invalid role selected';

  if (!division_id) return null;

  const division = await query(`SELECT division_name FROM divisions WHERE division_id = $1`, [division_id]);
  if (division.rows.length === 0) return 'Invalid division selected';

  const divisionName = String(division.rows[0].division_name || '').trim().toLowerCase();
  if (divisionName !== 'administrative' && roleId !== 1) {
    return 'Only the Division Staff role can be assigned to this division. Supply Officer and Administrator are limited to the Administrative division.';
  }

  return null;
}

async function handler(req, res) {
  if (req.method === 'GET') {
    try {
      const result = await query(`
        SELECT u.user_id, u.username, u.full_name,
          u.email, u.contact, u.is_active, u.created_at,
          u.role_id, u.division_id, d.division_name,
          r.role_name, r.hierarchy_level
        FROM users u
        JOIN roles r ON u.role_id = r.role_id
        LEFT JOIN divisions d ON u.division_id = d.division_id
        ORDER BY u.created_at DESC
      `);
      return res.status(200).json(result.rows);
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: 'Server error' });
    }
  }

  if (req.method === 'POST') {
    const { username, password, full_name, email, contact, role_id, division_id } = req.body;
    if (!username || !password || !full_name || !role_id)
      return res.status(400).json({ error: 'Missing required fields' });

    if (contact && contact.length > 11)
      return res.status(400).json({ error: 'Contact number must be at most 11 characters.' });

    const normalizedFullName = normalizeFullName(full_name);
    if (!FULL_NAME_PATTERN.test(normalizedFullName)) {
      return res.status(400).json({ error: 'Full name may contain letters, spaces, hyphens, apostrophes, dots, and ñ only.' });
    }

    try {
      const roleError = await validateRoleForDivision(role_id, division_id);
      if (roleError) return res.status(400).json({ error: roleError });

      const hash = await bcrypt.hash(password, 12);
      const result = await query(`
        INSERT INTO users (username, password_hash, full_name, email, contact, role_id, division_id)
        VALUES ($1,$2,$3,$4,$5,$6,$7)
        RETURNING user_id, username, full_name, email, role_id, division_id
      `, [username, hash, normalizedFullName, email, contact, role_id, division_id || null]);

      await query(`
        INSERT INTO audit_log (user_id, action, table_name, record_id, new_values)
        VALUES ($1,'CREATE','users',$2,$3)
      `, [req.user.user_id, result.rows[0].user_id, JSON.stringify(result.rows[0])]);

      return res.status(201).json(result.rows[0]);
    } catch (err) {
      if (err.code === '23505')
        return res.status(400).json({ error: 'Username already exists' });
      console.error(err);
      return res.status(500).json({ error: 'Server error' });
    }
  }

  if (req.method === 'PUT') {
    const { user_id, username, full_name, email, contact, role_id, division_id, password, is_active } = req.body;
    if (!user_id)
      return res.status(400).json({ error: 'User ID is required' });

    if (contact && contact.length > 11)
      return res.status(400).json({ error: 'Contact number must be at most 11 characters.' });

    const normalizedFullName = normalizeFullName(full_name);
    if (!FULL_NAME_PATTERN.test(normalizedFullName)) {
      return res.status(400).json({ error: 'Full name may contain letters, spaces, hyphens, apostrophes, dots, and ñ only.' });
    }

    try {
      const roleError = await validateRoleForDivision(role_id, division_id);
      if (roleError) return res.status(400).json({ error: roleError });

      const existing = await query(`SELECT * FROM users WHERE user_id = $1`, [user_id]);
      if (existing.rows.length === 0)
        return res.status(404).json({ error: 'User not found' });

      const current = existing.rows[0];

      const dup = await query(`SELECT user_id FROM users WHERE username = $1 AND user_id <> $2`, [username, user_id]);
      if (dup.rows.length > 0)
        return res.status(400).json({ error: 'Username already exists' });

      if (email) {
        const emailDup = await query(`SELECT user_id FROM users WHERE email = $1 AND user_id <> $2`, [email, user_id]);
        if (emailDup.rows.length > 0)
          return res.status(400).json({ error: 'Email already exists' });
      }

      let password_hash = current.password_hash;
      if (password && password.trim() !== '') {
        password_hash = await bcrypt.hash(password, 12);
      }

      const result = await query(`
        UPDATE users
        SET username = $1, full_name = $2, email = $3, contact = $4, role_id = $5, password_hash = $6, is_active = $7, division_id = $8
        WHERE user_id = $9
        RETURNING user_id, username, full_name, email, contact, role_id, is_active, division_id
      `, [username, normalizedFullName, email || null, contact || null, role_id, password_hash, is_active ?? current.is_active, division_id || null, user_id]);

      await query(`
        INSERT INTO audit_log (user_id, action, table_name, record_id, old_values, new_values)
        VALUES ($1,'UPDATE','users',$2,$3,$4)
      `, [req.user.user_id, user_id, JSON.stringify({ username: current.username, full_name: current.full_name, email: current.email, role_id: current.role_id, is_active: current.is_active }), JSON.stringify(result.rows[0])]);

      return res.status(200).json(result.rows[0]);
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: 'Server error' });
    }
  }

  if (req.method === 'DELETE') {
    const { user_id } = req.body || {};
    const targetUserId = Number(user_id);

    if (!Number.isInteger(targetUserId)) {
      return res.status(400).json({ error: 'A valid user ID is required' });
    }

    if (targetUserId === Number(req.user.user_id)) {
      return res.status(400).json({ error: 'You cannot delete your own account' });
    }

    try {
      const existing = await query(
        'SELECT user_id, username, role_id FROM users WHERE user_id = $1',
        [targetUserId]
      );
      const targetUser = existing.rows[0];

      if (!targetUser) return res.status(404).json({ error: 'User not found' });

      if (Number(targetUser.role_id) === 3) {
        const administrators = await query('SELECT COUNT(*)::int AS count FROM users WHERE role_id = 3');
        if (administrators.rows[0].count <= 1) {
          return res.status(400).json({ error: 'You cannot delete the last administrator account' });
        }
      }

      const deleted = await query(
        'DELETE FROM users WHERE user_id = $1 RETURNING user_id, username',
        [targetUserId]
      );

      await query(`
        INSERT INTO audit_log (user_id, action, table_name, record_id, old_values)
        VALUES ($1,'DELETE','users',$2,$3)
      `, [req.user.user_id, targetUserId, JSON.stringify(targetUser)]);

      return res.status(200).json({ message: 'User deleted permanently', user: deleted.rows[0] });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: 'Server error' });
    }
  }

  return res.status(405).end();
}

export default withAuth(handler, 3);
