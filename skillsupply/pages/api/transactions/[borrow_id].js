import pool from '../../../lib/db.js';
import { withAuth } from '../../../lib/rbac.js';

async function handler(req, res) {
  const { borrow_id } = req.query;
  const id = Number(borrow_id);

  if (req.method !== 'PUT') return res.status(405).end();

  const { status, remarks } = req.body;
  const validStatuses = ['Borrowed', 'Overdue', 'Returned', 'Cancelled'];

  if (!status || !validStatuses.includes(status))
    return res.status(400).json({ error: 'Valid status is required: Borrowed, Overdue, Returned, Cancelled' });

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const existing = await client.query(
      'SELECT * FROM borrow_transactions WHERE borrow_id=$1',
      [id]
    );
    if (existing.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Transaction not found' });
    }

    const current = existing.rows[0];

    if (current.status === 'Returned') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Cannot modify a returned transaction' });
    }

    if (current.status === 'Cancelled') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Cannot modify a cancelled transaction' });
    }

    if (status === 'Returned' && current.status === 'Returned') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Transaction is already returned' });
    }

    if (status === 'Returned') {
      await client.query(
        'INSERT INTO return_transactions (borrow_id, quantity_returned, condition_returned, processed_by, notes) VALUES ($1,$2,$3,$4,$5)',
        [id, current.quantity_borrowed, 'Good', req.user.user_id, remarks || '']
      );
      await client.query(
        'UPDATE inventory_items SET quantity_on_hand = quantity_on_hand + $1 WHERE item_id=$2',
        [current.quantity_borrowed, current.item_id]
      );
      await client.query(
        `UPDATE requisitions SET status='Returned'
         WHERE requisition_id=$1 AND requisition_id IS NOT NULL`,
        [current.requisition_id]
      );
    }

    if (status === 'Borrowed' && current.status === 'Overdue') {
      await client.query(
        'UPDATE inventory_items SET quantity_on_hand = quantity_on_hand - $1 WHERE item_id=$2',
        [current.quantity_borrowed, current.item_id]
      );
    }

    await client.query(
      'UPDATE borrow_transactions SET status=$1 WHERE borrow_id=$2',
      [status, id]
    );

    const updated = await client.query('SELECT * FROM borrow_transactions WHERE borrow_id=$1', [id]);

    await client.query(
      'INSERT INTO audit_log (user_id, username, action, table_name, record_id, old_values, new_values) VALUES ($1,$2,$3,$4,$5,$6,$7)',
      [req.user.user_id, req.user.username, 'UPDATE_STATUS', 'borrow_transactions', id, JSON.stringify(current), JSON.stringify(updated.rows[0])]
    );

    await client.query('COMMIT');

    return res.status(200).json(updated.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  } finally {
    client.release();
  }
}

export default withAuth(handler, 2);
