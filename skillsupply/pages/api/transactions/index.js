import { query, transaction } from '../../../lib/db.js';
import { withAuth } from '../../../lib/rbac.js';
import { createNotification, NOTIFICATION_TYPES } from '../../../lib/notifications.js';

async function handler(req, res) {
  if (req.method === 'GET') {
    try {
      const restricted = Number(req.user.hierarchy_level) < 2;
      const result = await query(`
        SELECT bt.*,
          CASE
            WHEN bt.status IN ('Borrowed', 'Active', 'Issued')
              AND bt.actual_return_date IS NULL
              AND bt.expected_return_date < CURRENT_DATE
            THEN 'Overdue'
            ELSE bt.status
          END AS status,
          i.item_name, i.unit_of_measure,
          i.requires_mr, i.is_borrowable, i.maximum_borrow_days,
          COALESCE(NULLIF(bt.borrower_name, ''), u.full_name) AS borrower_name,
          d.division_name,
          rt.condition_returned,
          rt.notes AS return_remarks
        FROM borrow_transactions bt
        JOIN inventory_items i ON bt.item_id = i.item_id
        LEFT JOIN users u ON bt.user_id = u.user_id
        LEFT JOIN divisions d ON bt.division_id = d.division_id
        LEFT JOIN LATERAL (
          SELECT condition_returned, notes
          FROM return_transactions
          WHERE borrow_id = bt.borrow_id
          ORDER BY return_id DESC
          LIMIT 1
        ) rt ON true
        ${restricted ? 'WHERE bt.user_id = $1' : ''}
        ORDER BY bt.created_at DESC
      `, restricted ? [req.user.user_id] : []);
      return res.status(200).json(result.rows);
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: 'Server error' });
    }
  }

  if (req.method === 'PUT') {
    if (Number(req.user.hierarchy_level) < 2)
      return res.status(403).json({ error: 'Forbidden' });

    const { id } = req.query;
    const { status } = req.body;
    if (!['Borrowed', 'Returned', 'Overdue'].includes(status))
      return res.status(400).json({ error: 'Invalid status' });

    try {
      const updated = await transaction(async (client) => {
        const existing = await client.query(
          'SELECT * FROM borrow_transactions WHERE borrow_id=$1 FOR UPDATE',
          [id]
        );
        if (!existing.rows[0]) {
          const error = new Error('Transaction not found');
          error.statusCode = 404;
          throw error;
        }
        const current = existing.rows[0];

        if (status === 'Overdue' && !['Borrowed', 'Active', 'Issued'].includes(current.status)) {
          const error = new Error('Only an approved borrowed transaction can become Overdue');
          error.statusCode = 400;
          throw error;
        }
        if (status === 'Borrowed' && !['Pending', 'Overdue'].includes(current.status)) {
          const error = new Error('Only pending or overdue transactions can be set to Borrowed');
          error.statusCode = 400;
          throw error;
        }
        if (status === 'Overdue' && !(new Date(current.expected_return_date) < new Date(new Date().toISOString().slice(0, 10)))) {
          const error = new Error('A transaction can only be marked Overdue after its expected return date has passed.');
          error.statusCode = 400;
          throw error;
        }
        if (status === 'Borrowed' && current.status === 'Pending') {
          const stock = await client.query(
            'SELECT quantity_on_hand FROM inventory_items WHERE item_id=$1 FOR UPDATE',
            [current.item_id]
          );
          if (!stock.rows[0] || stock.rows[0].quantity_on_hand < current.quantity_borrowed) {
            const error = new Error('Insufficient stock to approve this borrow');
            error.statusCode = 400;
            throw error;
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
          if (!['Borrowed', 'Overdue'].includes(current.status)) {
            const error = new Error('A pending transaction must be approved as Borrowed before it can be returned');
            error.statusCode = 400;
            throw error;
          }
          await client.query(
            'INSERT INTO return_transactions (borrow_id, quantity_returned, condition_returned, processed_by, notes) VALUES ($1,$2,$3,$4,$5)',
            [id, current.quantity_borrowed, 'Good', req.user.user_id, '']
          );
          await client.query(
            'UPDATE inventory_items SET quantity_on_hand = quantity_on_hand + $1 WHERE item_id=$2',
            [current.quantity_borrowed, current.item_id]
          );
        }

        const result = await client.query(
          `UPDATE borrow_transactions
           SET status=$1::varchar,
               actual_return_date=CASE WHEN $2::varchar='Returned' THEN CURRENT_DATE ELSE actual_return_date END
           WHERE borrow_id=$3::int
           RETURNING *`,
          [status, status, id]
        );
        const updatedRow = result.rows[0];

        const itemDetails = await client.query(
          'SELECT item_name, unit_of_measure FROM inventory_items WHERE item_id=$1',
          [current.item_id]
        );
        const item = itemDetails.rows[0] || {};

        await client.query(
          'INSERT INTO audit_log (user_id, username, action, table_name, record_id, old_values, new_values) VALUES ($1,$2,$3,$4,$5,$6)',
          [
            req.user.user_id,
            req.user.username || null,
            'UPDATE_STATUS',
            'borrow_transactions',
            String(id),
            JSON.stringify({ status: current.status, quantity_borrowed: current.quantity_borrowed, expected_return_date: current.expected_return_date }),
            JSON.stringify({ ...updatedRow, previous_status: current.status, changed_by: req.user.full_name || req.user.username || null })
          ]
        );

        await createNotification(client, {
          type: NOTIFICATION_TYPES.BORROW_STATUS,
          title: `Borrow request ${status.toLowerCase()}`,
          message: `${req.user.full_name || req.user.username} marked borrow request #${id} as ${status} — ${current.quantity_borrowed} ${item.unit_of_measure || 'unit(s)'} of ${item.item_name || 'item'}.`,
          link: '/transactions',
          referenceId: Number(id),
          includeUserIds: current.user_id ? [current.user_id] : [],
          excludeUserId: req.user.user_id
        });

        return updatedRow;
      });
      return res.status(200).json(updated);
    } catch (err) {
      console.error(err);
      return res.status(err.statusCode || 500).json({ error: err.message || 'Server error' });
    }
  }

  return res.status(405).end();
}

export default withAuth(handler, 1);
