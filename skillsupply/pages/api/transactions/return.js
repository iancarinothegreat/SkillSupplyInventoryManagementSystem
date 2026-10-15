import { transaction } from '../../../lib/db.js';
import { withAuth } from '../../../lib/rbac.js';
import { createNotification, NOTIFICATION_TYPES } from '../../../lib/notifications.js';

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
        INSERT INTO audit_log (user_id, username, action, table_name, record_id, old_values, new_values)
        VALUES ($1, $2, 'CREATE', 'return_transactions', $3, NULL, $4)
      `, [req.user.user_id, req.user.username || null, String(borrow_id), JSON.stringify({ borrow_id, item_id: current.item_id, quantity_returned: current.quantity_borrowed, condition_returned: condition, notes: notes || '' })]);

      await client.query(`
        INSERT INTO audit_log (user_id, username, action, table_name, record_id, old_values, new_values)
        VALUES ($1, $2, 'UPDATE_STATUS', 'borrow_transactions', $3, $4, $5)
      `, [
        req.user.user_id,
        req.user.username || null,
        String(borrow_id),
        JSON.stringify({ status: current.status, actual_return_date: current.actual_return_date }),
        JSON.stringify({ status: 'Returned', actual_return_date: new Date().toISOString(), condition_returned: condition })
      ]);

      const itemName = await client.query('SELECT item_name, unit_of_measure FROM inventory_items WHERE item_id = $1', [current.item_id]);

      await createNotification(client, {
        type: NOTIFICATION_TYPES.RETURN_COMPLETED,
        title: 'Item returned',
        message: `${current.borrower_name || 'A borrower'} returned ${current.quantity_borrowed} ${itemName.rows[0]?.unit_of_measure || 'unit(s)'} of ${itemName.rows[0]?.item_name || 'an item'} (${condition}).`,
        link: '/transactions',
        referenceId: Number(borrow_id),
        excludeUserId: req.user.user_id
      });


      if (condition === 'Good') {
        await client.query(
          'UPDATE inventory_items SET quantity_on_hand = quantity_on_hand + $1 WHERE item_id=$2',
          [current.quantity_borrowed, current.item_id]
        );
      } else if (condition === 'Damaged') {
        await client.query(
          'UPDATE inventory_items SET defective_quantity = COALESCE(defective_quantity, 0) + $1 WHERE item_id=$2',
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
