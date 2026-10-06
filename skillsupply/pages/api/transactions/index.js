import { query } from '../../../lib/db.js';
import { withAuth } from '../../../lib/rbac.js';

async function handler(req, res) {
  if (req.method === 'GET') {
    try {
      const result = await query(`
        SELECT bt.*,
          i.item_name, i.unit_of_measure,
          COALESCE(NULLIF(bt.borrower_name, ''), u.full_name) AS borrower_name,
          d.division_name
        FROM borrow_transactions bt
        JOIN inventory_items i ON bt.item_id = i.item_id
        LEFT JOIN users u ON bt.user_id = u.user_id
        LEFT JOIN divisions d ON bt.division_id = d.division_id
        ORDER BY bt.created_at DESC
      `);
      return res.status(200).json(result.rows);
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: 'Server error' });
    }
  }

  if (req.method === 'PUT') {
    const { id } = req.query;
    const { status } = req.body;
    if (!['Borrowed', 'Returned', 'Overdue'].includes(status))
      return res.status(400).json({ error: 'Invalid status' });

    try {
      const updates = { status };
      if (status === 'Returned') {
        updates.actual_return_date = new Date().toISOString();
      }
      const setClauses = Object.keys(updates).map((k, i) => `${k}=$${i + 1}`);
      const values = Object.values(updates);
      values.push(id);

      const result = await query(
        `UPDATE borrow_transactions SET ${setClauses.join(', ')} WHERE borrow_id=$${values.length} RETURNING *`,
        values
      );
      return res.status(200).json(result.rows[0]);
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: 'Server error' });
    }
  }

  return res.status(405).end();
}

export default withAuth(handler, 2);
