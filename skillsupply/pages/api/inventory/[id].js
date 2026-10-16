import { query } from '../../../lib/db.js';
import { withAuth } from '../../../lib/rbac.js';
import { parseMaxBorrowDays } from '../../../lib/utils.js';

async function handler(req, res) {
  const { id } = req.query;

  if (req.method === 'PUT') {
    const {
      item_name, serial_number, category_id, division_id,
      unit_of_measure, quantity_on_hand,
      reorder_level, defective_quantity, is_returnable, is_borrowable, maximum_borrow_days, requires_mr, unit_cost, description, notes, per_division_limit
    } = req.body;

    try {
      const old = await query('SELECT * FROM inventory_items WHERE item_id=$1', [id]);

      const result = await query(`
        UPDATE inventory_items
        SET item_name=$1, serial_number=$2, category_id=$3, division_id=$4,
            unit_of_measure=$5, quantity_on_hand=$6,
            reorder_level=$7, defective_quantity=$8, is_returnable=$9, unit_cost=$10, description=$11, notes=$12,
            is_borrowable=$13, maximum_borrow_days=$14, requires_mr=$15, per_division_limit=$16
        WHERE item_id=$17
        RETURNING *
      `, [item_name, serial_number || null, category_id, division_id, unit_of_measure, quantity_on_hand, reorder_level, defective_quantity ?? 0, is_returnable ?? false, unit_cost, description || null, notes || null, is_borrowable ?? true, parseMaxBorrowDays(maximum_borrow_days), requires_mr ?? false, per_division_limit === '' || per_division_limit == null ? null : parseInt(per_division_limit, 10), id]);

      await query(`
        INSERT INTO audit_log (user_id, action, table_name, record_id, old_values, new_values)
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
        INSERT INTO audit_log (user_id, action, table_name, record_id)
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
