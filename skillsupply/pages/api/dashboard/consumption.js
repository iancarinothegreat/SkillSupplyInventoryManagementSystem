import { query } from '../../../lib/db.js';
import { withAuth } from '../../../lib/rbac.js';

async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const result = await query(`
      SELECT d.division_name,
        COALESCE(SUM(bt.quantity_borrowed), 0) AS issued,
        COALESCE(SUM(rt.quantity_returned), 0) AS returned
      FROM divisions d
      LEFT JOIN borrow_transactions bt ON bt.division_id = d.division_id
      LEFT JOIN return_transactions rt ON rt.borrow_id = bt.borrow_id
      GROUP BY d.division_name
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
