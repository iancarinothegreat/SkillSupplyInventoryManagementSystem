import { query } from '../../../lib/db.js';
import { withAuth } from '../../../lib/rbac.js';
import { computeSMA } from '../../../lib/sma.js';

async function handler(req, res) {
  try {
    const windowMonths = parseInt(req.query.window) || 3;
    const items = await query(
      `SELECT i.item_id, i.item_name, i.quantity_on_hand AS stock, i.unit_of_measure, i.reorder_level AS reorder_point, c.category_name
       FROM inventory_items i
       LEFT JOIN categories c ON i.category_id = c.category_id
       WHERE i.is_active=true`
    );

    const forecasts = await Promise.all(
      items.rows.map(async item => {
        const sma = await computeSMA(item.item_id, windowMonths);
        return {
          item_id: item.item_id,
          item_name: item.item_name,
          stock: sma.stock ?? item.stock ?? 0,
          unit_of_measure: item.unit_of_measure,
          reorder_point: item.reorder_point ?? 0,
          category_name: item.category_name,
          sma: sma.sma,
          days_left: sma.daysLeft,
          severity: sma.severity,
        };
      })
    );

    forecasts.sort((a, b) => a.item_name.localeCompare(b.item_name));
    return res.status(200).json(forecasts);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
}

export default withAuth(handler, 2);
