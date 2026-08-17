import { query } from '../../../lib/db.js';
import { withAuth } from '../../../lib/rbac.js';
import { computeSMA } from '../../../lib/sma.js';

async function handler(req, res) {
  try {
    const windowMonths = parseInt(req.query.window) || 3;
    const items = await query(
      'SELECT item_id, item_name FROM inventory_items WHERE is_active=true'
    );

    const forecasts = await Promise.all(
      items.rows.map(async item => {
        const sma = await computeSMA(item.item_id, windowMonths);
        return { ...item, ...sma };
      })
    );

    forecasts.sort((a, b) => a.daysLeft - b.daysLeft);
    return res.status(200).json(forecasts);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
}

export default withAuth(handler, 2);