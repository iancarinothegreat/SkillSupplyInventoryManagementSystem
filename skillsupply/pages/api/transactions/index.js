import { query, transaction } from '../../../lib/db.js';
import { withAuth } from '../../../lib/rbac.js';

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
             SET quantity_consumed = quantity_consumed + $3
             WHERE item_id = $1 AND division_id = $2 AND consumption_date = CURRENT_DATE`,
            [current.item_id, current.division_id, current.quantity_borrowed]
          );
          if (consumption.rowCount === 0) {
            await client.query(
              `INSERT INTO consumption_tracking
                (item_id, division_id, quantity_consumed, consumption_date)
               VALUES ($1, $2, $3, CURRENT_DATE)`,
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
           SET status=$1, actual_return_date=CASE WHEN $1='Returned' THEN NOW() ELSE actual_return_date END
           WHERE borrow_id=$2
           RETURNING *`,
          [status, id]
        );
        return result.rows[0];
      });
      return res.status(200).json(updated);
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: 'Server error' });
    }
  }

  return res.status(405).end();
}

export default withAuth(handler, 1);
