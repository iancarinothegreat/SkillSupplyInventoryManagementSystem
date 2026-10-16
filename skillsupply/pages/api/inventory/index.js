import { query } from '../../../lib/db.js';
import { verifyToken, getTokenFromRequest } from '../../../lib/auth.js';
import { parseMaxBorrowDays } from '../../../lib/utils.js';

async function handler(req, res) {
  if (req.method === 'GET') {
    const token = getTokenFromRequest(req);
    if (!token) return res.status(401).json({ error: 'Unauthorized' });
    const decoded = verifyToken(token);
    if (!decoded) return res.status(401).json({ error: 'Invalid token' });

    try {
      const result = await query(`
        SELECT i.item_id, i.item_name, i.serial_number, i.category_id, i.division_id, i.unit_of_measure,
          i.quantity_on_hand, i.reorder_level, i.defective_quantity AS defective_qty,
          i.quantity_on_hand + COALESCE(i.defective_quantity, 0) AS total_quantity, i.is_returnable, i.is_borrowable, i.maximum_borrow_days, i.requires_mr, i.unit_cost, i.description, i.notes, i.is_active, i.created_at,
          c.category_name,
          d.division_name,
          CASE
            WHEN i.quantity_on_hand <= i.reorder_level THEN 'Critical'
            WHEN i.quantity_on_hand <= i.reorder_level * 1.5 THEN 'Low Stock'
            ELSE 'Sufficient'
          END as stock_status
        FROM inventory_items i
        LEFT JOIN categories c ON i.category_id = c.category_id
        LEFT JOIN divisions d ON i.division_id = d.division_id
        WHERE i.is_active = true
        ORDER BY i.item_name
      `);
      return res.status(200).json(result.rows);
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: 'Server error' });
    }
  }

  if (req.method === 'POST') {
    const token = getTokenFromRequest(req);
    if (!token) return res.status(401).json({ error: 'Unauthorized' });
    const decoded = verifyToken(token);
    if (!decoded || decoded.hierarchy_level < 2) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const {
      item_name, serial_number, category_id, division_id,
      unit_of_measure, quantity_on_hand,
      reorder_level, defective_quantity, is_returnable, is_borrowable, maximum_borrow_days, requires_mr, unit_cost, description, notes, per_division_limit
    } = req.body;

    if (!item_name) return res.status(400).json({ error: 'Item name required' });

    try {
      const result = await query(`
        INSERT INTO inventory_items
          (item_name, serial_number, category_id, division_id, unit_of_measure, quantity_on_hand,
           reorder_level, defective_quantity, is_returnable, is_borrowable, maximum_borrow_days, requires_mr, unit_cost, description, notes, per_division_limit)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
        RETURNING *
      `, [item_name, serial_number || null, category_id, division_id, unit_of_measure, quantity_on_hand || 0, reorder_level || 10, defective_quantity ?? 0, is_returnable ?? false, is_borrowable ?? true, parseMaxBorrowDays(maximum_borrow_days), requires_mr ?? false, unit_cost, description || null, notes || null, per_division_limit === '' || per_division_limit == null ? null : parseInt(per_division_limit, 10)]);

      await query(`
        INSERT INTO audit_log (user_id, action, table_name, record_id, new_values)
        VALUES ($1,'CREATE','inventory_items',$2,$3)
      `, [decoded.user_id, result.rows[0].item_id, JSON.stringify(result.rows[0])]);

      return res.status(201).json(result.rows[0]);
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: 'Server error' });
    }
  }

  return res.status(405).end();
}

export default handler;
