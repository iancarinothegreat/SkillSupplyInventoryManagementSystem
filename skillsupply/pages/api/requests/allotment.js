import { query } from '../../../lib/db.js';
import { withAuth } from '../../../lib/rbac.js';

async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  const itemId = parseInt(req.query.item_id, 10);
  let divisionId = parseInt(req.query.division_id, 10);
  if (!itemId) return res.status(400).json({ error: 'item_id required' });
  if (!divisionId) {
    const userResult = await query('SELECT division_id FROM users WHERE user_id = $1', [req.user.user_id]);
    divisionId = userResult.rows[0]?.division_id;
    if (!divisionId) return res.status(400).json({ error: 'division_id required' });
  }

  try {
    const itemResult = await query(
      'SELECT item_name, per_division_limit FROM inventory_items WHERE item_id = $1',
      [itemId]
    );
    const item = itemResult.rows[0];
    if (!item) return res.status(404).json({ error: 'Item not found' });

    if (item.per_division_limit == null) {
      return res.status(200).json({ per_division_limit: null });
    }

    const releasedResult = await query(`
      SELECT COALESCE(SUM(ri.quantity_issued), 0) AS released
      FROM requisitions r
      JOIN requisition_items ri ON ri.requisition_id = r.requisition_id
      WHERE r.division_id = $1 AND ri.item_id = $2 AND r.status = 'Released'
    `, [divisionId, itemId]);

    const activeBorrowResult = await query(`
      SELECT COALESCE(SUM(quantity_borrowed), 0) AS active
      FROM borrow_transactions
      WHERE division_id = $1 AND item_id = $2 AND status IN ('Borrowed', 'Active', 'Overdue')
    `, [divisionId, itemId]);

    const used = Number(releasedResult.rows[0].released) + Number(activeBorrowResult.rows[0].active);

    return res.status(200).json({
      per_division_limit: item.per_division_limit,
      used,
      remaining: Math.max(0, item.per_division_limit - used)
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
}

export default withAuth(handler, 1);
