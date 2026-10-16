import { transaction } from '../../../lib/db.js';
import { withAuth } from '../../../lib/rbac.js';
import { createNotification, NOTIFICATION_TYPES } from '../../../lib/notifications.js';

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
            SELECT r.status, ri.requisition_item_id, ri.item_id AS previous_item_id,
                   ri.quantity_requested AS previous_quantity, ri.purpose AS previous_purpose
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
            'SELECT item_id, item_name, unit_of_measure, quantity_on_hand FROM inventory_items WHERE item_id = $1 AND is_active = true FOR UPDATE',
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
            INSERT INTO audit_log (user_id, username, action, table_name, record_id, old_values, new_values)
            VALUES ($1, $2, 'UPDATE', 'requisitions', $3, $4, $5)
          `, [
            req.user.user_id,
            req.user.username || null,
            id,
            JSON.stringify({
              status: previous.status,
              item_id: previous.previous_item_id,
              quantity_requested: previous.previous_quantity,
              purpose: previous.previous_purpose
            }),
            JSON.stringify({
              item_id: Number(item_id),
              item_name: item.rows[0].item_name,
              quantity_requested: parsedQuantity,
              previous_quantity: previous.previous_quantity,
              quantity_on_hand: item.rows[0].quantity_on_hand,
              purpose: purpose.trim(),
              status: previous.status
            })
          ]);

          await createNotification(client, {
            type: NOTIFICATION_TYPES.REQUISITION_UPDATED,
            title: 'Requisition updated',
            message: `Requisition #${id} was updated: ${parsedQuantity} ${item.rows[0].unit_of_measure || 'unit(s)'} of ${item.rows[0].item_name} (was ${previous.previous_quantity}).`,
            link: '/requisitions',
            referenceId: Number(id),
            excludeUserId: req.user.user_id
          });

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

    const approvedQuantity = typeof req.body.approved_quantity !== 'undefined' && req.body.approved_quantity !== ''
      ? Number(req.body.approved_quantity)
      : null;
    if (approvedQuantity !== null && (!Number.isInteger(approvedQuantity) || approvedQuantity < 1)) {
      return res.status(400).json({ error: 'Approved quantity must be a whole number of at least 1' });
    }

    const mrNumber = (req.body.mr_number || '').toString().trim();

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
                   i.quantity_on_hand, i.item_name, i.requires_mr
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
          const mrRequired = items.rows.some((item) => item.requires_mr);
          if (mrRequired && !mrNumber) {
            const error = new Error('An MR (Memorandum Receipt) number is required for accountable items');
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
            SET status = 'Released', released_by = $1, release_date = NOW(),
                mr_number = $3, mr_date = CASE WHEN $3::varchar IS NULL THEN mr_date ELSE CURRENT_DATE END
            WHERE requisition_id = $2
            RETURNING *
          `, [req.user.user_id, id, mrNumber || null]);

          const releasedItems = await client.query(`
            SELECT ri.item_id, ri.quantity_issued, i.item_name, i.unit_of_measure
            FROM requisition_items ri
            JOIN inventory_items i ON i.item_id = ri.item_id
            WHERE ri.requisition_id = $1
          `, [id]);

          await client.query(`
            INSERT INTO audit_log (user_id, username, action, table_name, record_id, old_values, new_values)
            VALUES ($1, $2, 'RELEASE', 'requisitions', $3, $4, $5)
          `, [
            req.user.user_id,
            req.user.username || null,
            id,
            JSON.stringify({ status: previous.status }),
            JSON.stringify({
              ...released.rows[0],
              released_by_name: req.user.full_name || req.user.username || null,
              released_items: releasedItems.rows,
              mr_number: mrNumber || null
            })
          ]);

          const itemSummary = releasedItems.rows
            .map((r) => `${r.quantity_issued} ${r.unit_of_measure || 'unit(s)'} of ${r.item_name}`)
            .join(', ');

          await createNotification(client, {
            type: NOTIFICATION_TYPES.REQUISITION_RELEASED,
            title: 'Requisition released',
            message: `${req.user.full_name || req.user.username} released ${itemSummary}${mrNumber ? ` (MR ${mrNumber})` : ''}.`,
            link: '/requisitions',
            referenceId: Number(id),
            includeUserIds: [previous.user_id],
            excludeUserId: req.user.user_id
          });

          return released.rows[0];
        }

        if (previous.status !== 'Pending') {
          const error = new Error(`Requisition is already ${previous.status}`);
          error.statusCode = 409;
          throw error;
        }

        const requestedItems = await client.query(`
          SELECT ri.requisition_item_id, ri.item_id, ri.quantity_requested,
                 i.item_name, i.unit_of_measure, i.quantity_on_hand
          FROM requisition_items ri
          JOIN inventory_items i ON i.item_id = ri.item_id
          WHERE ri.requisition_id = $1
          FOR UPDATE OF i
        `, [id]);

        let approvedQty = null;

        if (status === 'Approved') {
          if (requestedItems.rows.length === 1 && approvedQuantity !== null) {
            const only = requestedItems.rows[0];
            if (approvedQuantity > only.quantity_requested) {
              const error = new Error(`Approved quantity cannot exceed the requested quantity (${only.quantity_requested}).`);
              error.statusCode = 400;
              throw error;
            }
            if (approvedQuantity > only.quantity_on_hand) {
              const error = new Error(`Insufficient stock for ${only.item_name}: approved ${approvedQuantity}, available ${only.quantity_on_hand}.`);
              error.statusCode = 400;
              throw error;
            }
            approvedQty = approvedQuantity;
            await client.query(`
              UPDATE requisition_items
              SET quantity_approved = $1, status = 'Approved'
              WHERE requisition_item_id = $2
            `, [approvedQty, only.requisition_item_id]);
          } else {
            const insufficient = requestedItems.rows.find((item) => item.quantity_on_hand < item.quantity_requested);
            if (insufficient) {
              const error = new Error(`Insufficient stock for ${insufficient.item_name}: requested ${insufficient.quantity_requested}, available ${insufficient.quantity_on_hand}. Adjust the approved quantity before approving.`);
              error.statusCode = 400;
              throw error;
            }
            approvedQty = requestedItems.rows.reduce((sum, item) => sum + item.quantity_requested, 0);
            await client.query(`
              UPDATE requisition_items
              SET quantity_approved = quantity_requested, status = 'Approved'
              WHERE requisition_id = $1
            `, [id]);
          }
        } else {
          await client.query(`UPDATE requisition_items SET status = 'Rejected' WHERE requisition_id = $1`, [id]);
        }

        const updated = await client.query(`
          UPDATE requisitions
          SET status=$1, approved_by=$2, approval_date=NOW(), approval_remarks=$3
          WHERE requisition_id=$4
          RETURNING *
        `, [status, req.user.user_id, remarks || null, id]);

        const approverName = req.user.full_name || req.user.username || null;

        await client.query(`
          INSERT INTO audit_log (user_id, username, action, table_name, record_id, old_values, new_values)
          VALUES ($1, $2, 'UPDATE_STATUS', 'requisitions', $3, $4, $5)
        `, [
          req.user.user_id,
          req.user.username || null,
          id,
          JSON.stringify({ status: previous.status }),
          JSON.stringify({
            ...updated.rows[0],
            previous_status: previous.status,
            approved_by_name: approverName,
            approval_date: new Date().toISOString(),
            approval_remarks: remarks || null,
            items: requestedItems.rows.map((item) => ({
              item_id: item.item_id,
              item_name: item.item_name,
              quantity_requested: item.quantity_requested,
              quantity_approved: status === 'Approved'
                ? (requestedItems.rows.length === 1 && approvedQty !== null ? approvedQty : item.quantity_requested)
                : null,
              quantity_on_hand: item.quantity_on_hand
            }))
          })
        ]);

        const itemSummary = requestedItems.rows
          .map((r) => `${r.item_name} (${r.quantity_requested} ${r.unit_of_measure || 'requested'}${status === 'Approved' && approvedQty !== null && requestedItems.rows.length === 1 ? `, ${approvedQty} approved` : ''})`)
          .join(', ');

        await createNotification(client, {
          type: NOTIFICATION_TYPES.REQUISITION_STATUS,
          title: `Requisition ${status.toLowerCase()}`,
          message: `${approverName} ${status.toLowerCase()} requisition #${id} — ${itemSummary}${remarks ? `. Remarks: ${remarks}` : ''}`,
          link: '/requisitions',
          referenceId: Number(id),
          includeUserIds: [previous.user_id],
          excludeUserId: req.user.user_id
        });

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
          SELECT r.status, ri.item_id, ri.quantity_requested, ri.purpose
          FROM requisitions r
          LEFT JOIN requisition_items ri ON ri.requisition_id = r.requisition_id
          WHERE r.requisition_id = $1 AND r.user_id = $2
          FOR UPDATE OF r
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
          INSERT INTO audit_log (user_id, username, action, table_name, record_id, old_values, new_values)
          VALUES ($1, $2, 'DELETE', 'requisitions', $3, $4, NULL)
        `, [
          req.user.user_id,
          req.user.username || null,
          id,
          JSON.stringify(previous)
        ]);

        await client.query(
          'DELETE FROM notifications WHERE reference_id = $1 AND type LIKE \'REQUISITION_%\'',
          [id]
        );

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
