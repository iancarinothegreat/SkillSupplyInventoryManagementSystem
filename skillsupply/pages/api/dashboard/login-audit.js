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
        whereClause += ` AND user_id = $${paramIdx}`;
        params.push(user_id);
        paramIdx++;
      }

      const result = await query(`
        SELECT la.id, la.user_id, la.username, la.action, la.failure_reason,
          TO_CHAR(la.login_time + INTERVAL '8 hours', 'MM/DD/YYYY HH12:MI:SS AM') AS login_time_display,
          CASE WHEN la.logout_time IS NOT NULL THEN TO_CHAR(la.logout_time + INTERVAL '8 hours', 'MM/DD/YYYY HH12:MI:SS AM') ELSE NULL END AS logout_time_display,
          la.ip_address, la.user_agent,
          u.full_name, r.role_name
        FROM login_audit la
        LEFT JOIN users u ON la.user_id = u.user_id
        LEFT JOIN roles r ON u.role_id = r.role_id
        ${whereClause}
        ORDER BY la.login_time DESC
        LIMIT 100
      `, params);

      // Keep the table limited to the newest 100 rows for performance, but
      // calculate the KPI totals from the complete filtered audit history.
      const totalsResult = await query(`
        SELECT
          COUNT(*) FILTER (WHERE action = 'LOGIN')::int AS total_logins,
          COUNT(*) FILTER (WHERE action = 'LOGOUT')::int AS total_logouts,
          COUNT(*) FILTER (WHERE action = 'LOGIN_FAILED')::int AS failed_logins,
          COUNT(DISTINCT user_id) FILTER (WHERE user_id IS NOT NULL)::int AS unique_users,
          COUNT(*)::int AS total_events
        FROM login_audit
        ${whereClause}
      `, params);

      return res.status(200).json({
        rows: result.rows,
        totals: totalsResult.rows[0] || {
          total_logins: 0,
          total_logouts: 0,
          failed_logins: 0,
          unique_users: 0,
          total_events: 0,
        },
      });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: 'Server error' });
    }
  }
  return res.status(405).end();
}

export default withAuth(handler, 3);
