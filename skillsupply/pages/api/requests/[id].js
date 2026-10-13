import { transaction } from '../../../lib/db.js';
import { withAuth } from '../../../lib/rbac.js';

async function handler(req, res) {
  const { id } = req.query;

  if (req.method === 'PUT') {
    const { status, remarks } = req.body;

    if (typeof status === 'undefined') {
      if (req.user.hierarchy_level !== 1) {
        return res.status(400).json({ error: 'Invalid request update' });
      }

      const { item_id, quantity, purpose } = req.body;
      const parsedQuantity = Number(quantity);
      if (!item_id || !Number.isInteger(parsedQuantity) || parsedQuantity < 1 || !purpose?.trim()) {
        return res.status(400).json({ error: 'Item, quantity, and purpose are required' });
      }

      try {
        const result = await transaction(async (client) => {
          const existing = await client.query(`
            SELECT r.status, ri.requisition_item_id
            FROM requisitions r
            JOIN requisition_items ri ON ri.requisition_id = r.requisition_id
            WHERE r.requisition_id = $1 AND r.user_id = $2
            FOR UPDATE OF r, ri
          `, [id, req.user.user_id]);
          const previous = existing.rows[0];
          if (!previous) {
            const error = new Error('Requisition not found');
            error.statusCode = 404;
            throw error;
          }
          if (previous.status !== 'Pending') {
            const error = new Error('Only pending requisitions can be edited');
            error.statusCode = 409;
            throw error;
          }

          const item = await client.query(
            'SELECT item_id, item_name, quantity_on_hand FROM inventory_items WHERE item_id = $1 AND is_active = true FOR UPDATE',
            [item_id]
          );
          if (!item.rows[0]) {
            const error = new Error('Item not found');
            error.statusCode = 400;
            throw error;
          }
          if (parsedQuantity > item.rows[0].quantity_on_hand) {
            const error = new Error(`Insufficient stock for ${item.rows[0].item_name}: requested ${parsedQuantity}, available ${item.rows[0].quantity_on_hand}.`);
            error.statusCode = 400;
            throw error;
          }

          const updated = await client.query(`
            UPDATE requisition_items
            SET item_id = $1, quantity_requested = $2, purpose = $3
            WHERE requisition_item_id = $4
            RETURNING requisition_id
          `, [item_id, parsedQuantity, purpose.trim(), previous.requisition_item_id]);

          await client.query(`
            INSERT INTO audit_log (user_id, action, table_name, record_id, old_values, new_values)
            VALUES ($1, 'UPDATE', 'requisitions', $2, $3, $4)
          `, [
            req.user.user_id,
            id,
            JSON.stringify({ status: previous.status }),
            JSON.stringify({ item_id, quantity: parsedQuantity, purpose: purpose.trim() })
          ]);
          return updated.rows[0];
        });

        return res.status(200).json({ message: 'Requisition updated successfully', ...result });
      } catch (err) {
        console.error(err);
        return res.status(err.statusCode || 500).json({ error: err.message || 'Server error' });
      }
    }

    if (!['Approved', 'Rejected', 'Released'].includes(status))
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
        if (status === 'Released') {
          if (req.user.hierarchy_level < 2) {
            const error = new Error('Only supply officers and administrators can release items');
            error.statusCode = 403;
            throw error;
          }
          if (previous.status !== 'Approved') {
            const error = new Error('Only approved requisitions can be released');
            error.statusCode = 409;
            throw error;
          }

          const items = await client.query(`
            SELECT ri.requisition_item_id, ri.item_id,
                   COALESCE(ri.quantity_approved, ri.quantity_requested) AS quantity_to_release,
                   i.quantity_on_hand
            FROM requisition_items ri
            JOIN inventory_items i ON i.item_id = ri.item_id
            WHERE ri.requisition_id = $1
            FOR UPDATE OF i
          `, [id]);
          const insufficient = items.rows.find((item) => item.quantity_on_hand < item.quantity_to_release);
          if (insufficient) {
            const error = new Error('Insufficient stock for one or more requested items');
            error.statusCode = 400;
            throw error;
          }

          await client.query(`
            UPDATE requisition_items
            SET quantity_issued = COALESCE(quantity_approved, quantity_requested), status = 'Released'
            WHERE requisition_id = $1
          `, [id]);
          await client.query(`
            UPDATE inventory_items i
            SET quantity_on_hand = i.quantity_on_hand - ri.quantity_issued
            FROM requisition_items ri
            WHERE ri.requisition_id = $1 AND ri.item_id = i.item_id
          `, [id]);
          const released = await client.query(`
            UPDATE requisitions
            SET status = 'Released', released_by = $1, release_date = NOW()
            WHERE requisition_id = $2
            RETURNING *
          `, [req.user.user_id, id]);
          await client.query(`
            INSERT INTO audit_log (user_id, action, table_name, record_id, old_values, new_values)
            VALUES ($1, 'RELEASE', 'requisitions', $2, $3, $4)
          `, [req.user.user_id, id, JSON.stringify({ status: previous.status }), JSON.stringify(released.rows[0])]);
          return released.rows[0];
        }

        if (previous.status !== 'Pending') {
          const error = new Error(`Requisition is already ${previous.status}`);
          error.statusCode = 409;
          throw error;
        }

        if (status === 'Approved') {
          const items = await client.query(`
            SELECT i.item_name, ri.quantity_requested, i.quantity_on_hand
            FROM requisition_items ri
            JOIN inventory_items i ON i.item_id = ri.item_id
            WHERE ri.requisition_id = $1
            FOR UPDATE OF i
          `, [id]);
          const insufficient = items.rows.find((item) => item.quantity_on_hand < item.quantity_requested);
          if (insufficient) {
            const error = new Error(`Insufficient stock for ${insufficient.item_name}: requested ${insufficient.quantity_requested}, available ${insufficient.quantity_on_hand}.`);
            error.statusCode = 400;
            throw error;
          }

          await client.query(`
            UPDATE requisition_items
            SET quantity_approved = quantity_requested, status = 'Approved'
            WHERE requisition_id = $1
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

  if (req.method === 'DELETE') {
    if (req.user.hierarchy_level !== 1) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    try {
      const result = await transaction(async (client) => {
        const existing = await client.query(`
          SELECT r.status
          FROM requisitions r
          WHERE r.requisition_id = $1 AND r.user_id = $2
          FOR UPDATE
        `, [id, req.user.user_id]);
        const previous = existing.rows[0];
        if (!previous) {
          const error = new Error('Requisition not found');
          error.statusCode = 404;
          throw error;
        }
        if (previous.status !== 'Pending') {
          const error = new Error('Only pending requisitions can be deleted');
          error.statusCode = 409;
          throw error;
        }

        await client.query('DELETE FROM requisition_items WHERE requisition_id = $1', [id]);
        const deleted = await client.query(
          'DELETE FROM requisitions WHERE requisition_id = $1 RETURNING requisition_id',
          [id]
        );
        await client.query(`
          INSERT INTO audit_log (user_id, action, table_name, record_id, old_values)
          VALUES ($1, 'DELETE', 'requisitions', $2, $3)
        `, [req.user.user_id, id, JSON.stringify(previous)]);
        return deleted.rows[0];
      });

      return res.status(200).json({ message: 'Requisition deleted successfully', ...result });
    } catch (err) {
      console.error(err);
      return res.status(err.statusCode || 500).json({ error: err.message || 'Server error' });
    }
  }

  return res.status(405).end();
}

export default withAuth(handler, 1);
