import { query } from '../../../lib/db.js';
import { withAuth } from '../../../lib/rbac.js';

async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { borrow_id, quantity_returned, condition_returned, notes } = req.body;

  if (!borrow_id || !quantity_returned)
    return res.status(400).json({ error: 'Missing required fields' });

  try {
    const borrow = await query(
      'SELECT * FROM borrow_transactions WHERE borrow_id=$1',
      [borrow_id]
    );

    if (!borrow.rows[0])
      return res.status(404).json({ error: 'Transaction not found' });

    await query(`
      INSERT INTO return_transactions
        (borrow_id, quantity_returned, condition_returned, processed_by, notes)
      VALUES ($1,$2,$3,$4,$5)
    `, [borrow_id, quantity_returned, condition_returned || 'Good', req.user.user_id, notes]);

    await query(
      'UPDATE borrow_transactions SET status=$1, actual_return_date=NOW() WHERE borrow_id=$2',
      ['Returned', borrow_id]
    );

    if (condition_returned === 'Good' || condition_returned === 'Damaged') {
      await query(
        'UPDATE inventory_items SET quantity_on_hand = quantity_on_hand + $1 WHERE item_id=$2',
        [quantity_returned, borrow.rows[0].item_id]
      );
    }

    return res.status(201).json({ success: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
}

export default withAuth(handler, 2);