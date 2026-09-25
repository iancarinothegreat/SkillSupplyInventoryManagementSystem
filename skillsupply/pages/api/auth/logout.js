import { query } from '../../../lib/db.js';
import { getTokenFromRequest } from '../../../lib/auth.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const token = getTokenFromRequest(req);
  let userId = null;
  let username = null;

  if (token) {
    try {
      const jwt = (await import('jsonwebtoken')).default;
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      userId = decoded.user_id;
      username = decoded.username;
    } catch {
      // Token invalid — still attempt logout logging if provided
    }
  }

  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  userId = body.user_id || userId;
  username = body.username || username;

  // Close the latest open login session so its logout_time is populated.
  if (userId && username) {
    try {
      // Close the open login session's logout_time
      await query(
        `UPDATE login_audit
         SET logout_time = NOW()
         WHERE id = (
           SELECT id
           FROM login_audit
           WHERE user_id = $1 AND action = 'LOGIN' AND logout_time IS NULL
           ORDER BY login_time DESC
           LIMIT 1
         )`,
        [userId]
      );

      // Always insert a LOGOUT action record
      await query(
        `INSERT INTO login_audit (user_id, username, action, ip_address, user_agent)
         VALUES ($1, $2, 'LOGOUT', $3, $4)`,
        [userId, username, req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || null, req.headers['user-agent'] || null]
      );
    } catch (err) {
      console.error('Failed to log logout:', err);
    }
  }

  return res.status(200).json({ success: true });
}
