import { query } from '../../../lib/db.js';
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

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { full_name, username, email, contact, password, role_id, division_id } = req.body;

  const normalizedUsername = username.trim().toLowerCase();
  const normalizedFullName = normalizeFullName(full_name);
  const usernamePattern = /^[a-zñ]\.[a-zñ][a-zñ]+$/;
  const passwordPattern = /^(?=.*[^A-Za-z0-9]).{8,}$/;

  if (!username || !password || !normalizedFullName)
    return res.status(400).json({ error: 'Full name, username, and password are required' });

  if (contact && contact.length > 11)
    return res.status(400).json({ error: 'Contact number must be at most 11 characters.' });

  if (!FULL_NAME_PATTERN.test(normalizedFullName)) {
    return res.status(400).json({ error: 'Full name may contain letters, spaces, hyphens, apostrophes, dots, and ñ only.' });
  }

  if (!usernamePattern.test(normalizedUsername)) {
    return res.status(400).json({ error: 'Username must use the format j.kdelacruz (first initial.lastname).' });
  }

  if (!passwordPattern.test(password)) {
    return res.status(400).json({ error: 'Password must be at least 8 characters and include at least one special character.' });
  }

  const validRoles = [1, 2];
  const selectedRole = validRoles.includes(Number(role_id)) ? Number(role_id) : 1;
  const selectedDivision = division_id ? Number(division_id) : null;

  try {
    const existing = await query(`SELECT user_id FROM users WHERE username = $1`, [normalizedUsername]);
    if (existing.rows.length > 0)
      return res.status(400).json({ error: 'Username already exists' });

    if (email) {
      const emailCheck = await query(`SELECT user_id FROM users WHERE email = $1`, [email]);
      if (emailCheck.rows.length > 0)
        return res.status(400).json({ error: 'Email already exists' });
    }

    const hash = await bcrypt.hash(password, 12);

    const result = await query(`
      INSERT INTO users (role_id, username, password_hash, full_name, email, contact, division_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING user_id, username, full_name, email, contact, role_id, division_id
    `, [selectedRole, normalizedUsername, hash, normalizedFullName, email || null, contact || null, selectedDivision]);

    return res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
}
