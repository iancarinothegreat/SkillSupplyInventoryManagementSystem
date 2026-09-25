import { query } from '../../../lib/db.js';
import { withAuth } from '../../../lib/rbac.js';

async function handler(req, res) {
  if (req.method === 'GET') {
    try {
      const { from, to, user_id } = req.query;

      let whereClause = 'WHERE 1=1';
      const params = [];
      let paramIdx = 1;

      if (from) {
        whereClause += ` AND login_time >= $${paramIdx}`;
        params.push(from);
        paramIdx++;
      }

      if (to) {
        whereClause += ` AND login_time <= $${paramIdx}`;
        params.push(to);
        paramIdx++;
      }

      if (user_id) {
        whereClause += ` AND la.user_id = $${paramIdx}`;
        params.push(user_id);
        paramIdx++;
      }

      const result = await query(`
        SELECT la.id, la.user_id, la.username, la.action, la.failure_reason,
          TO_CHAR(la.login_time, 'MM/DD/YYYY HH12:MI:SS AM') AS login_time_display,
          TO_CHAR(la.logout_time, 'MM/DD/YYYY HH12:MI:SS AM') AS logout_time_display,
          la.ip_address, la.user_agent,
          u.full_name, r.role_name,
          COUNT(*) OVER (PARTITION BY la.user_id, DATE(la.login_time), la.action) AS daily_count
        FROM login_audit la
        LEFT JOIN users u ON la.user_id = u.user_id
        LEFT JOIN roles r ON u.role_id = r.role_id
        ${whereClause}
        ORDER BY la.login_time DESC
        LIMIT 500
      `, params);

      return res.status(200).json(result.rows);
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: 'Server error' });
    }
  }
  return res.status(405).end();
}

export default withAuth(handler, 3);
