import { query } from '../../../lib/db.js';
import { withAuth } from '../../../lib/rbac.js';

async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  try {
    const result = await query(`
      SELECT bt.*,
        i.item_name, i.unit_of_measure,
        u.full_name as borrower_name,
        d.division_name
      FROM borrow_transactions bt
      JOIN inventory_items i ON bt.item_id = i.item_id
      LEFT JOIN users u ON bt.user_id = u.user_id
      LEFT JOIN divisions d ON bt.division_id = d.division_id

      ORDER BY bt.created_at DESC
      LIMIT 50
    `);
    return res.status(200).json(result.rows);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
}

export default withAuth(handler, 2);