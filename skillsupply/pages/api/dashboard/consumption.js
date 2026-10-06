import { query } from '../../../lib/db.js';
import { withAuth } from '../../../lib/rbac.js';

async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const result = await query(`
      SELECT d.division_name,
        COALESCE(consumed.issued, 0) AS issued,
        COALESCE(returned.returned, 0) AS returned
      FROM divisions d
      LEFT JOIN (
        SELECT division_id, SUM(quantity_consumed) AS issued
        FROM consumption_tracking
        GROUP BY division_id
      ) consumed ON consumed.division_id = d.division_id
      LEFT JOIN (
        SELECT bt.division_id, SUM(rt.quantity_returned) AS returned
        FROM return_transactions rt
        JOIN borrow_transactions bt ON bt.borrow_id = rt.borrow_id
        GROUP BY bt.division_id
      ) returned ON returned.division_id = d.division_id
      ORDER BY d.division_name
    `);
    const data = result.rows.map(row => ({
      division: row.division_name,
      issued: parseInt(row.issued, 10),
      returned: parseInt(row.returned, 10)
    }));
    return res.status(200).json(data);
  } catch (err) {
    console.error('Consumption API error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}

export default withAuth(handler, 1);
