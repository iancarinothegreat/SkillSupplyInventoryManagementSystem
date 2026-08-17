import { query } from '../../../lib/db.js';
import { withAuth } from '../../../lib/rbac.js';

async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();
  const result = await query('SELECT * FROM categories ORDER BY category_name');
  return res.status(200).json(result.rows);
}

export default withAuth(handler, 1);