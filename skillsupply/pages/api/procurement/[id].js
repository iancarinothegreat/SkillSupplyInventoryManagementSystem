import { withAuth } from '../../../lib/rbac';
import db from '../../../lib/db';
import { createNotification, NOTIFICATION_TYPES, NOTIFICATION_LINKS } from '../../../lib/notifications';

const ALLOWED_TRANSITIONS = {
  Pending: ['Approved', 'Rejected', 'Cancelled'],
  Approved: ['Received', 'Cancelled'],
};

async function loadRequest(client, id) {
  const { rows } = await client.query(
    `SELECT pr.*, d.division_name, u.full_name AS requested_by_name
     FROM procurement_requests pr
     LEFT JOIN divisions d ON d.division_id = pr.division_id
     LEFT JOIN users u ON u.user_id = pr.requested_by
     WHERE pr.procurement_id = $1`,
    [id]
  );
  return rows[0] || null;
}

async function handlePut(req, res) {
  const { procurement_id } = req.query;
  const { status, approval_remarks, received_items } = req.body || {};
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const existing = await loadRequest(client, procurement_id);
    if (!existing) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Procurement request not found.' });
    }

    if (status) {
      const allowed = ALLOWED_TRANSITIONS[existing.status] || [];
      if (!allowed.includes(status)) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: `Cannot change status from ${existing.status} to ${status}.` });
      }

      if (status === 'Approved' || status === 'Rejected') {
        await client.query(
          `UPDATE procurement_requests
           SET status = $1, approved_by = $2, approval_date = CURRENT_DATE, approval_remarks = $3
           WHERE procurement_id = $4`,
          [status, req.user.user_id, approval_remarks || null, procurement_id]
        );
      } else {
        await client.query(
          `UPDATE procurement_requests SET status = $1 WHERE procurement_id = $2`,
          [status, procurement_id]
        );
      }

      if (status === 'Received') {
        await client.query(
          `UPDATE procurement_requests
           SET received_by = $1, received_date = NOW()
           WHERE procurement_id = $2`,
          [req.user.user_id, procurement_id]
        );

        const itemsToUpdate = Array.isArray(received_items) ? received_items : [];
        for (const ri of itemsToUpdate) {
          const qty = Math.max(0, Number(ri.quantity_received) || 0);
          if (qty <= 0) continue;
          const pi = await client.query(
            `SELECT pi.*, i.item_name FROM procurement_items pi
             JOIN inventory_items i ON i.item_id = pi.item_id
             WHERE pi.procurement_item_id = $1 AND pi.procurement_id = $2`,
            [ri.procurement_item_id, procurement_id]
          );
          const row = pi.rows[0];
          if (!row) continue;
          await client.query(
            `UPDATE procurement_items SET quantity_received = $1 WHERE procurement_item_id = $2`,
            [qty, ri.procurement_item_id]
          );
          await client.query(
            `UPDATE inventory_items SET quantity_on_hand = quantity_on_hand + $1 WHERE item_id = $2`,
            [qty, row.item_id]
          );
          await client.query(
            `INSERT INTO audit_log (user_id, username, action, table_name, record_id, old_values, new_values)
             VALUES ($1, $2, 'UPDATE', 'inventory_items', $3, $4::jsonb, $5::jsonb)`,
            [
              req.user.user_id,
              req.user.username,
              row.item_id,
              JSON.stringify({ quantity_on_hand: 'procurement receive' }),
              JSON.stringify({ item_name: row.item_name, received: qty, procurement_id: Number(procurement_id) }),
            ]
          );
        }
      }

      await client.query(
        `INSERT INTO audit_log (user_id, username, action, table_name, record_id, old_values, new_values)
         VALUES ($1, $2, 'UPDATE_STATUS', 'procurement_requests', $3, $4::jsonb, $5::jsonb)`,
        [
          req.user.user_id,
          req.user.username,
          procurement_id,
          JSON.stringify({ status: existing.status }),
          JSON.stringify({ status, approval_remarks: approval_remarks || null, by: req.user.full_name || req.user.username }),
        ]
      );

      const type = status === 'Received'
        ? NOTIFICATION_TYPES.PROCUREMENT_RECEIVED
        : NOTIFICATION_TYPES.PROCUREMENT_STATUS;

      await createNotification(client, {
        type,
        title: `Procurement #${procurement_id} ${status}`,
        message: `Procurement request #${procurement_id} for ${existing.division_name || 'a division'} is now ${status}.`,
        link: NOTIFICATION_LINKS[type],
        referenceId: Number(procurement_id),
        includeUserIds: existing.requested_by ? [existing.requested_by] : [],
        excludeUserId: req.user.user_id,
      });
    }

    await client.query('COMMIT');
    const updated = await loadRequest(client, procurement_id);
    res.status(200).json(updated);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Failed to update procurement request.' });
  } finally {
    client.release();
  }
}

async function handleDelete(req, res) {
  const { procurement_id } = req.query;
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const existing = await loadRequest(client, procurement_id);
    if (!existing) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Procurement request not found.' });
    }
    if (!['Pending', 'Cancelled', 'Rejected'].includes(existing.status)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Only pending, cancelled, or rejected requests can be deleted.' });
    }
    await client.query('DELETE FROM procurement_requests WHERE procurement_id = $1', [procurement_id]);
    await client.query(
      `INSERT INTO audit_log (user_id, username, action, table_name, record_id, old_values)
       VALUES ($1, $2, 'DELETE', 'procurement_requests', $3, $4::jsonb)`,
      [req.user.user_id, req.user.username, procurement_id, JSON.stringify(existing)]
    );
    await client.query('COMMIT');
    res.status(200).json({ success: true });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Failed to delete procurement request.' });
  } finally {
    client.release();
  }
}

async function handler(req, res) {
  if (req.method === 'PUT') return handlePut(req, res);
  if (req.method === 'DELETE') return handleDelete(req, res);
  res.setHeader('Allow', ['PUT', 'DELETE']);
  res.status(405).json({ error: 'Method not allowed' });
}

export default withAuth(handler, 2);
