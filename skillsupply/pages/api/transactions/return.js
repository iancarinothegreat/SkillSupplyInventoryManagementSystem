import { transaction } from '../../../lib/db.js';
import { withAuth } from '../../../lib/rbac.js';

async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { borrow_id, condition_returned, notes } = req.body;

  if (!borrow_id)
    return res.status(400).json({ error: 'Missing required fields' });

  try {
    await transaction(async (client) => {
      const borrow = await client.query(
        'SELECT * FROM borrow_transactions WHERE borrow_id=$1 FOR UPDATE',
        [borrow_id]
      );
      if (!borrow.rows[0]) {
        const error = new Error('Transaction not found');
        error.statusCode = 404;
        throw error;
      }

      const current = borrow.rows[0];
      if (current.status === 'Returned') {
        const error = new Error('Transaction is already returned');
        error.statusCode = 409;
        throw error;
      }
      const condition = condition_returned || 'Good';

      await client.query(`
        INSERT INTO return_transactions
          (borrow_id, quantity_returned, condition_returned, processed_by, notes)
        VALUES ($1,$2,$3,$4,$5)
      `, [borrow_id, current.quantity_borrowed, condition, req.user.user_id, notes || '']);

      await client.query(
        'UPDATE borrow_transactions SET status=$1, actual_return_date=NOW() WHERE borrow_id=$2',
        ['Returned', borrow_id]
      );

      await client.query(`
        INSERT INTO audit_log (user_id, action, table_name, record_id, new_values)
        VALUES ($1,'CREATE','return_transactions',$2,$3)
      `, [req.user.user_id, borrow_id, JSON.stringify({ borrow_id, item_id: current.item_id, quantity_returned: current.quantity_borrowed, condition_returned: condition })]);

      if (condition === 'Good' || condition === 'Damaged') {
        await client.query(
          'UPDATE inventory_items SET quantity_on_hand = quantity_on_hand + $1 WHERE item_id=$2',
          [current.quantity_borrowed, current.item_id]
        );
      }
    });

    return res.status(201).json({ success: true });
  } catch (err) {
    console.error(err);
    return res.status(err.statusCode || 500).json({ error: err.message || 'Server error' });
  }
}

export default withAuth(handler, 2);
