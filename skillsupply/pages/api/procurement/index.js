import { withAuth } from '../../../lib/rbac';
import db from '../../../lib/db';
import { createNotification, NOTIFICATION_TYPES, NOTIFICATION_LINKS } from '../../../lib/notifications';

async function handleGet(req, res) {
  const client = await db.connect();
  try {
    const { rows } = await client.query(`
      SELECT pr.procurement_id, pr.status, pr.justification, pr.supplier_name,
             pr.reference_number, pr.notes, pr.approval_date, pr.approval_remarks,
             pr.received_date, pr.created_at,
             d.division_name,
             u.full_name AS requested_by_name,
             au.full_name AS approved_by_name,
             ru.full_name AS received_by_name,
             COALESCE((
               SELECT json_agg(json_build_object(
                 'procurement_item_id', pi.procurement_item_id,
                 'item_id', pi.item_id,
                 'item_name', i.item_name,
                 'unit_of_measure', i.unit_of_measure,
                 'quantity_requested', pi.quantity_requested,
                 'quantity_received', pi.quantity_received,
                 'unit_cost', pi.unit_cost
               ))
               FROM procurement_items pi
               JOIN inventory_items i ON i.item_id = pi.item_id
               WHERE pi.procurement_id = pr.procurement_id
             ), '[]'::json) AS items
      FROM procurement_requests pr
      LEFT JOIN divisions d ON d.division_id = pr.division_id
      LEFT JOIN users u ON u.user_id = pr.requested_by
      LEFT JOIN users au ON au.user_id = pr.approved_by
      LEFT JOIN users ru ON ru.user_id = pr.received_by
      ORDER BY pr.created_at DESC
    `);
    res.status(200).json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load procurement requests.' });
  } finally {
    client.release();
  }
}

async function handlePost(req, res) {
  const { division_id, justification, supplier_name, reference_number, notes, items } = req.body || {};
  if (!division_id) return res.status(400).json({ error: 'Division is required.' });
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Add at least one item to the procurement request.' });
  }
  for (const it of items) {
    if (!it.item_id || Number(it.quantity_requested) <= 0) {
      return res.status(400).json({ error: 'Each item needs a valid item and quantity greater than zero.' });
    }
  }

  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO procurement_requests (requested_by, division_id, status, justification, supplier_name, reference_number, notes)
       VALUES ($1, $2, 'Pending', $3, $4, $5, $6) RETURNING procurement_id`,
      [req.user.user_id, division_id, justification || null, supplier_name || null, reference_number || null, notes || null]
    );
    const procurementId = rows[0].procurement_id;

    for (const it of items) {
      await client.query(
        `INSERT INTO procurement_items (procurement_id, item_id, quantity_requested, unit_cost)
         VALUES ($1, $2, $3, $4)`,
        [procurementId, it.item_id, Number(it.quantity_requested), it.unit_cost || null]
      );
    }

    await client.query(
      `INSERT INTO audit_log (user_id, username, action, table_name, record_id, new_values)
       VALUES ($1, $2, 'CREATE', 'procurement_requests', $3, $4::jsonb)`,
      [req.user.user_id, req.user.username, procurementId, JSON.stringify({ division_id, items, justification })]
    );

    await createNotification(client, {
      type: NOTIFICATION_TYPES.PROCUREMENT_CREATED,
      title: 'New Procurement Request',
      message: `${req.user.full_name || req.user.username} created procurement request #${procurementId}.`,
      link: NOTIFICATION_LINKS.PROCUREMENT_CREATED,
      referenceId: procurementId,
      excludeUserId: req.user.user_id,
    });

    await client.query('COMMIT');
    res.status(201).json({ procurement_id: procurementId, status: 'Pending' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Failed to create procurement request.' });
  } finally {
    client.release();
  }
}

async function handler(req, res) {
  if (req.method === 'GET') return handleGet(req, res);
  if (req.method === 'POST') return handlePost(req, res);
  res.setHeader('Allow', ['GET', 'POST']);
  res.status(405).json({ error: 'Method not allowed' });
}

export default withAuth(handler, 2);
