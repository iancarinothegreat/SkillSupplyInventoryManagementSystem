import { query, transaction } from '../../../lib/db.js';
import { withAuth } from '../../../lib/rbac.js';
import { createNotification, NOTIFICATION_TYPES } from '../../../lib/notifications.js';

async function handler(req, res) {
  if (req.method === 'GET') {
    try {
      const user = req.user;
      let whereClause = 'WHERE 1=1';
      const params = [];

      if (user.hierarchy_level === 1) {
        whereClause += ' AND r.user_id = $1';
        params.push(user.user_id);
      }

      const result = await query(`
        SELECT r.requisition_id AS id,
          r.user_id,
          r.division_id,
          r.status,
          r.requested_date,
          r.approved_by,
          r.approval_date,
          r.approval_remarks,
          r.released_by,
          r.release_date,
          r.mr_number,
          r.mr_date,
          r.created_at,
          u.full_name AS requester_name,
          u.username,
          d.division_name,
          i.item_id,
          i.item_name,
          i.unit_of_measure,
          i.quantity_on_hand AS available_stock,
          i.requires_mr,
          i.reorder_level,
          ri.quantity_requested AS quantity,
          ri.quantity_approved,
          ri.quantity_issued,
          ri.purpose,
          ri.requisition_item_id
        FROM requisitions r
        JOIN users u ON r.user_id = u.user_id
        LEFT JOIN divisions d ON r.division_id = d.division_id
        JOIN requisition_items ri ON ri.requisition_id = r.requisition_id
        JOIN inventory_items i ON ri.item_id = i.item_id
        ${whereClause}
        ORDER BY r.created_at DESC
      `, params);

      return res.status(200).json(result.rows);
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: 'Server error' });
    }
  }

  if (req.method === 'POST') {
    const { item_id, quantity, purpose } = req.body;
    const parsedQuantity = Number(quantity);

    if (!item_id || !Number.isInteger(parsedQuantity) || parsedQuantity < 1)
      return res.status(400).json({ error: 'Item and quantity are required' });

    try {
      const user = req.user;

      const requisition = await transaction(async (client) => {
        const itemResult = await client.query(`
          SELECT item_name, quantity_on_hand
          FROM inventory_items
          WHERE item_id = $1 AND is_active = true
          FOR UPDATE
        `, [item_id]);
        const item = itemResult.rows[0];
        if (!item) {
          const error = new Error('Item not found');
          error.statusCode = 400;
          throw error;
        }
        if (parsedQuantity > item.quantity_on_hand) {
          const error = new Error(`Insufficient stock for ${item.item_name}: requested ${parsedQuantity}, available ${item.quantity_on_hand}.`);
          error.statusCode = 400;
          throw error;
        }

        const divisionResult = await client.query(`
          SELECT division_id FROM users WHERE user_id = $1
        `, [user.user_id]);
        const divisionId = divisionResult.rows[0]?.division_id;

        const requisitionResult = await client.query(`
          INSERT INTO requisitions (user_id, division_id, status, requested_date)
          VALUES ($1, $2, 'Pending', CURRENT_DATE)
          RETURNING requisition_id, user_id, division_id, status, requested_date, created_at
        `, [user.user_id, divisionId]);

        const createdRequisition = requisitionResult.rows[0];

        await client.query(`
          INSERT INTO requisition_items (requisition_id, item_id, quantity_requested, purpose, status)
          VALUES ($1, $2, $3, $4, 'Pending')
        `, [createdRequisition.requisition_id, item_id, parsedQuantity, purpose || null]);

        const auditDetails = {
          item_id: Number(item_id),
          item_name: item.item_name,
          quantity_requested: parsedQuantity,
          quantity_on_hand: item.quantity_on_hand,
          purpose: purpose || null,
          division_id: divisionId || null,
          status: 'Pending'
        };

        await client.query(`
          INSERT INTO audit_log (user_id, username, action, table_name, record_id, old_values, new_values)
          VALUES ($1, $2, 'CREATE', 'requisitions', $3, NULL, $4)
        `, [
          user.user_id,
          user.username || null,
          String(createdRequisition.requisition_id),
          JSON.stringify(auditDetails)
        ]);

        await createNotification(client, {
          type: NOTIFICATION_TYPES.REQUISITION_CREATED,
          title: 'New requisition request',
          message: `${user.full_name || user.username} requested ${parsedQuantity} ${item.unit_of_measure || 'unit(s)'} of ${item.item_name} (${item.quantity_on_hand} in stock).`,
          link: '/requisitions',
          referenceId: createdRequisition.requisition_id,
          excludeUserId: user.user_id
        });

        return createdRequisition;
      });

      return res.status(201).json({
        message: 'Requisition created successfully',
        requisition_id: requisition.requisition_id
      });
    } catch (err) {
      console.error('Requisition creation error:', err);
      return res.status(err.statusCode || 500).json({ error: err.message || 'Server error' });
    }
  }

  return res.status(405).end();
}

export default withAuth(handler, 1);
