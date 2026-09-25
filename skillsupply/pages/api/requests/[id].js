import { transaction } from '../../../lib/db.js';
import { withAuth } from '../../../lib/rbac.js';

async function handler(req, res) {
  const { id } = req.query;

  if (req.method === 'PUT') {
    const { status, remarks } = req.body;
    if (!['Approved', 'Rejected'].includes(status))
      return res.status(400).json({ error: 'Invalid status' });

    try {
      const result = await transaction(async (client) => {
        const existing = await client.query('SELECT * FROM requisitions WHERE requisition_id=$1 FOR UPDATE', [id]);
        const previous = existing.rows[0] || null;
        if (!previous) {
          const error = new Error('Requisition not found');
          error.statusCode = 404;
          throw error;
        }
        if (previous.status !== 'Pending') {
          const error = new Error(`Requisition is already ${previous.status}`);
          error.statusCode = 409;
          throw error;
        }

        const items = await client.query(`
          SELECT ri.requisition_item_id, ri.item_id,
                 COALESCE(ri.quantity_approved, ri.quantity_requested) AS quantity_issued,
                 i.quantity_on_hand
          FROM requisition_items ri
          JOIN inventory_items i ON i.item_id = ri.item_id
          WHERE ri.requisition_id = $1
          FOR UPDATE OF i
        `, [id]);

        if (status === 'Approved') {
          const insufficient = items.rows.find((item) => item.quantity_on_hand < item.quantity_issued);
          if (insufficient) {
            const error = new Error('Insufficient stock for one or more requested items');
            error.statusCode = 400;
            throw error;
          }
          await client.query(`
            UPDATE requisition_items
            SET quantity_issued = COALESCE(quantity_approved, quantity_requested), status = 'Approved'
            WHERE requisition_id = $1
          `, [id]);
          await client.query(`
            UPDATE inventory_items i
            SET quantity_on_hand = i.quantity_on_hand - ri.quantity_issued
            FROM requisition_items ri
            WHERE ri.requisition_id = $1 AND ri.item_id = i.item_id
          `, [id]);
        } else {
          await client.query(`UPDATE requisition_items SET status = 'Rejected' WHERE requisition_id = $1`, [id]);
        }

        const updated = await client.query(`
          UPDATE requisitions
          SET status=$1, approved_by=$2, approval_date=NOW(), approval_remarks=$3
          WHERE requisition_id=$4
          RETURNING *
        `, [status, req.user.user_id, remarks || null, id]);

        await client.query(`
          INSERT INTO audit_log (user_id, action, table_name, record_id, old_values, new_values)
          VALUES ($1,'UPDATE_STATUS','requisitions',$2,$3,$4)
        `, [req.user.user_id, id, JSON.stringify({ status: previous.status }), JSON.stringify(updated.rows[0])]);
        return updated.rows[0];
      });

      return res.status(200).json(result);
    } catch (err) {
      console.error(err);
      return res.status(err.statusCode || 500).json({ error: err.message || 'Server error' });
    }
  }

  return res.status(405).end();
}

export default withAuth(handler, 2);
