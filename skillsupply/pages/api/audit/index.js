import { query } from '../../../lib/db.js';
import { withAuth } from '../../../lib/rbac.js';

async function handler(req, res) {
  if (req.method === 'GET') {
    try {
      const { search, action, table_name, user_id, from, to, sort = 'timestamp', order = 'DESC', limit = '100' } = req.query;

      let whereClause = 'WHERE 1=1';
      const params = [];
      let paramIdx = 1;

      if (search) {
        whereClause += ` AND (u.full_name ILIKE $${paramIdx} OR a.action ILIKE $${paramIdx} OR a.table_name ILIKE $${paramIdx} OR CAST(a.record_id AS TEXT) ILIKE $${paramIdx})`;
        params.push(`%${search}%`);
        paramIdx++;
      }

      if (action) {
        whereClause += ` AND a.action = $${paramIdx}`;
        params.push(action);
        paramIdx++;
      }

      if (table_name) {
        whereClause += ` AND a.table_name = $${paramIdx}`;
        params.push(table_name);
        paramIdx++;
      }

      if (user_id) {
        whereClause += ` AND a.user_id = $${paramIdx}`;
        params.push(user_id);
        paramIdx++;
      }

      if (from) {
        whereClause += ` AND a.timestamp >= $${paramIdx}`;
        params.push(from);
        paramIdx++;
      }

      if (to) {
        whereClause += ` AND a.timestamp <= $${paramIdx}`;
        params.push(to);
        paramIdx++;
      }

      const allowedSorts = ['timestamp', 'action', 'table_name', 'user_id'];
      const sortCol = allowedSorts.includes(sort) ? sort : 'timestamp';
      const sortOrder = order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

      const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 100, 1), 1000);

      const result = await query(`
        SELECT a.audit_id, a.user_id, a.action, a.table_name, a.record_id, a.old_values, a.new_values, a.timestamp,
          u.full_name, u.username
        FROM audit_log a
        LEFT JOIN users u ON a.user_id = u.user_id
        ${whereClause}
        ORDER BY a.${sortCol} ${sortOrder}
        LIMIT ${safeLimit}
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
