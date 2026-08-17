import { query } from '../../../lib/db.js';
import { withAuth } from '../../../lib/rbac.js';

async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const result = await query(`
      WITH months AS (
        SELECT to_char(now() - (i || ' month')::interval, 'YYYY-MM') AS month
        FROM generate_series(0, 5) i
      ),
      issued AS (
        SELECT to_char(borrow_date, 'YYYY-MM') AS month, SUM(quantity_borrowed) AS issued
        FROM borrow_transactions
        WHERE borrow_date >= now() - interval '6 months'
        GROUP BY to_char(borrow_date, 'YYYY-MM')
      ),
      returned AS (
        SELECT to_char(bt.borrow_date, 'YYYY-MM') AS month, SUM(rt.quantity_returned) AS returned
        FROM return_transactions rt
        JOIN borrow_transactions bt ON bt.borrow_id = rt.borrow_id
        WHERE bt.borrow_date >= now() - interval '6 months'
        GROUP BY to_char(bt.borrow_date, 'YYYY-MM')
      )
      SELECT m.month,
        COALESCE(i.issued, 0) AS issued,
        COALESCE(r.returned, 0) AS returned
      FROM months m
      LEFT JOIN issued i ON i.month = m.month
      LEFT JOIN returned r ON r.month = m.month
      ORDER BY m.month
    `);
    const data = result.rows.map(row => ({
      month: row.month,
      issued: parseInt(row.issued, 10),
      returned: parseInt(row.returned, 10)
    }));
    return res.status(200).json(data);
  } catch (err) {
    console.error('Monthly trend API error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}

export default withAuth(handler, 1);
