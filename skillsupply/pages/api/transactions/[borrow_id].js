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

    if (status === 'Overdue') {
      if (!['Borrowed', 'Active', 'Issued'].includes(current.status)) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Only an approved borrowed transaction can become Overdue' });
      }
      const overdueCheck = await client.query(
        `SELECT expected_return_date < CURRENT_DATE AS is_overdue
         FROM borrow_transactions
         WHERE borrow_id = $1`,
        [id]
      );
      if (!overdueCheck.rows[0]?.is_overdue) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'A transaction can only be marked Overdue after its expected return date has passed.' });
      }
    }

    if (status === 'Returned' && current.status === 'Returned') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Transaction is already returned' });
    }

    if (status === 'Returned' && !['Borrowed', 'Overdue'].includes(current.status)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'A pending transaction must be approved as Borrowed before it can be returned' });
    }

    if (status === 'Borrowed' && !['Pending', 'Overdue'].includes(current.status)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Only pending or overdue transactions can be set to Borrowed' });
    }

    if (status === 'Borrowed' && current.status === 'Pending') {
      const stock = await client.query(
        'SELECT quantity_on_hand FROM inventory_items WHERE item_id=$1 FOR UPDATE',
        [current.item_id]
      );
      if (!stock.rows[0] || stock.rows[0].quantity_on_hand < current.quantity_borrowed) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Insufficient stock to approve this borrow' });
      }
      await client.query(
        'UPDATE inventory_items SET quantity_on_hand = quantity_on_hand - $1 WHERE item_id=$2',
        [current.quantity_borrowed, current.item_id]
      );
      const consumption = await client.query(
        `UPDATE consumption_tracking
         SET quantity_consumed = quantity_consumed + $3::int
         WHERE item_id = $1::int AND division_id = $2::int AND consumption_date = CURRENT_DATE`,
        [current.item_id, current.division_id, current.quantity_borrowed]
      );
      if (consumption.rowCount === 0) {
        await client.query(
          `INSERT INTO consumption_tracking
            (item_id, division_id, quantity_consumed, consumption_date)
           VALUES ($1::int, $2::int, $3::int, CURRENT_DATE)`,
          [current.item_id, current.division_id, current.quantity_borrowed]
        );
      }
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
         WHERE requisition_id=$1`,
        [current.requisition_id]
      );
    }

    await client.query(
      `UPDATE borrow_transactions
       SET status=$1::varchar,
           actual_return_date=CASE WHEN $2::varchar='Returned' THEN CURRENT_DATE ELSE actual_return_date END
       WHERE borrow_id=$3::int`,
      [status, status, id]
    );

    const updated = await client.query('SELECT * FROM borrow_transactions WHERE borrow_id=$1', [id]);

    await client.query(
      'INSERT INTO audit_log (user_id, action, table_name, record_id, old_values, new_values) VALUES ($1,$2,$3,$4,$5,$6)',
      [req.user.user_id, 'UPDATE_STATUS', 'borrow_transactions', id, JSON.stringify(current), JSON.stringify(updated.rows[0])]
    );

    await client.query('COMMIT');

    return res.status(200).json(updated.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error(err);
    return res.status(err.statusCode || 500).json({ error: err.message || 'Server error' });
  } finally {
    client.release();
  }
}

export default withAuth(handler, 2);
