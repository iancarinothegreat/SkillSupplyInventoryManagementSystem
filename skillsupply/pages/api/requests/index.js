import { query } from '../../../lib/db.js';
import { withAuth } from '../../../lib/rbac.js';

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
          r.created_at,
          u.full_name AS requester_name,
          u.username,
          d.division_name,
          i.item_name,
          ri.quantity_requested AS quantity,
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

    if (!item_id || !quantity)
      return res.status(400).json({ error: 'Item and quantity are required' });

    try {
      const user = req.user;

      const divisionResult = await query(`
        SELECT division_id FROM users WHERE user_id = $1
      `, [user.user_id]);
      const divisionId = divisionResult.rows[0]?.division_id;

      const requisitionResult = await query(`
        INSERT INTO requisitions (user_id, division_id, status, requested_date)
        VALUES ($1, $2, 'Pending', CURRENT_DATE)
        RETURNING requisition_id, user_id, division_id, status, requested_date, created_at
      `, [user.user_id, divisionId]);

      const requisition = requisitionResult.rows[0];

      await query(`
        INSERT INTO requisition_items (requisition_id, item_id, quantity_requested, purpose, status)
        VALUES ($1, $2, $3, $4, 'Pending')
      `, [requisition.requisition_id, item_id, quantity, purpose || null]);

      return res.status(201).json({
        message: 'Requisition created successfully',
        requisition_id: requisition.requisition_id
      });
    } catch (err) {
      console.error('Requisition creation error:', err);
      return res.status(500).json({ error: 'Server error', details: err.message });
    }
  }

  return res.status(405).end();
}

export default withAuth(handler, 1);
