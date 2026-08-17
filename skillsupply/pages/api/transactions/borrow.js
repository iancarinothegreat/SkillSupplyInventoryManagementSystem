import { query } from '../../../lib/db.js';
import { withAuth } from '../../../lib/rbac.js';

async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { item_id, division_id, quantity_borrowed, expected_return_date, purpose } = req.body;

  if (!item_id || !division_id || !quantity_borrowed)
    return res.status(400).json({ error: 'Missing required fields' });

  try {
    const stock = await query(
      'SELECT quantity_on_hand, item_name FROM inventory_items WHERE item_id=$1',
      [item_id]
    );

    if (!stock.rows[0])
      return res.status(404).json({ error: 'Item not found' });

    if (stock.rows[0].quantity_on_hand < quantity_borrowed)
      return res.status(400).json({ error: 'Insufficient stock' });

    const txn = await query(`
      INSERT INTO borrow_transactions
        (item_id, user_id, division_id, quantity_borrowed, expected_return_date, purpose)
      VALUES ($1,$2,$3,$4,$5,$6)
      RETURNING *
    `, [item_id, req.user.user_id, division_id, quantity_borrowed, expected_return_date, purpose]);

    await query(
      'UPDATE inventory_items SET quantity_on_hand = quantity_on_hand - $1 WHERE item_id=$2',
      [quantity_borrowed, item_id]
    );

    return res.status(201).json(txn.rows[0]);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
}

export default withAuth(handler, 2);