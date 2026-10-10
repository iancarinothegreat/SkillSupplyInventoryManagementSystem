import { transaction } from '../../../lib/db.js';
import { withAuth } from '../../../lib/rbac.js';

async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { item_id, division_id, quantity_borrowed, borrower_name, expected_return_date, purpose } = req.body;

  const quantity = Number(quantity_borrowed);
  if (!item_id || !division_id || !Number.isInteger(quantity) || quantity <= 0)
    return res.status(400).json({ error: 'Missing required fields' });
  if (!borrower_name?.trim())
    return res.status(400).json({ error: 'Borrower name is required' });

  try {
    const txn = await transaction(async (client) => {
      const stock = await client.query(
        'SELECT quantity_on_hand, item_name, is_returnable FROM inventory_items WHERE item_id=$1 FOR UPDATE',
        [item_id]
      );
      if (!stock.rows[0]) {
        const error = new Error('Item not found');
        error.statusCode = 404;
        throw error;
      }
      if (!stock.rows[0].is_returnable) {
        const error = new Error('This item is not returnable and cannot be borrowed');
        error.statusCode = 400;
        throw error;
      }
      if (stock.rows[0].quantity_on_hand < quantity) {
        const error = new Error('Insufficient stock');
        error.statusCode = 400;
        throw error;
      }

      const result = await client.query(`
        INSERT INTO borrow_transactions
          (item_id, user_id, division_id, quantity_borrowed, borrower_name, expected_return_date, purpose, status)
        VALUES ($1,$2,$3,$4,$5,$6,$7,'Borrowed')
        RETURNING *
      `, [item_id, req.user.user_id, division_id, quantity, borrower_name.trim(), expected_return_date, purpose]);

      await client.query(
        'UPDATE inventory_items SET quantity_on_hand = quantity_on_hand - $1 WHERE item_id=$2',
        [quantity, item_id]
      );

      await client.query(`
        INSERT INTO consumption_tracking
          (item_id, division_id, quantity_consumed, consumption_date)
        VALUES ($1, $2, $3, CURRENT_DATE)
        ON CONFLICT (item_id, division_id, consumption_date)
        DO UPDATE SET quantity_consumed = consumption_tracking.quantity_consumed + EXCLUDED.quantity_consumed
      `, [item_id, division_id, quantity]);

      await client.query(`
        INSERT INTO audit_log (user_id, action, table_name, record_id, new_values)
        VALUES ($1,'CREATE','borrow_transactions',$2,$3)
      `, [req.user.user_id, result.rows[0].borrow_id, JSON.stringify(result.rows[0])]);
      return result.rows[0];
    });

    return res.status(201).json(txn);
  } catch (err) {
    console.error(err);
    return res.status(err.statusCode || 500).json({ error: err.message || 'Server error' });
  }
}

export default withAuth(handler, 1);
