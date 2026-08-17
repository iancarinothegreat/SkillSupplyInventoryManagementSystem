import { query } from '../../../lib/db.js';
import { withAuth } from '../../../lib/rbac.js';

async function handler(req, res) {
  const { id } = req.query;

  if (req.method === 'PUT') {
    const {
      item_name, serial_number, category_id, division_id,
      unit_of_measure, quantity_on_hand,
      reorder_level, unit_cost
    } = req.body;

    try {
      const old = await query('SELECT * FROM inventory_items WHERE item_id=$1', [id]);

      const result = await query(`
        UPDATE inventory_items
        SET item_name=$1, serial_number=$2, category_id=$3, division_id=$4,
            unit_of_measure=$5, quantity_on_hand=$6,
            reorder_level=$7, unit_cost=$8
        WHERE item_id=$9
        RETURNING *
      `, [item_name, serial_number || null, category_id, division_id, unit_of_measure, quantity_on_hand, reorder_level, unit_cost, id]);

      await query(`
        INSERT INTO audit_log (user_id, action_type, affected_table, affected_record_id, old_value, new_value)
        VALUES ($1,'UPDATE','inventory_items',$2,$3,$4)
      `, [req.user.user_id, id, JSON.stringify(old.rows[0]), JSON.stringify(result.rows[0])]);

      return res.status(200).json(result.rows[0]);
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: 'Server error' });
    }
  }

  if (req.method === 'DELETE') {
    try {
      await query('UPDATE inventory_items SET is_active=false WHERE item_id=$1', [id]);
      await query(`
        INSERT INTO audit_log (user_id, action_type, affected_table, affected_record_id)
        VALUES ($1,'DELETE','inventory_items',$2)
      `, [req.user.user_id, id]);
      return res.status(200).json({ success: true });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: 'Server error' });
    }
  }

  return res.status(405).end();
}

export default withAuth(handler, 2);
