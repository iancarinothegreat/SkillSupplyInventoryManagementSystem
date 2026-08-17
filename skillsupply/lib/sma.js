import { query } from './db.js';

export async function computeSMA(itemId, windowMonths = 3) {
  const result = await query(`
    SELECT DATE_TRUNC('month', borrow_date) AS month,
           SUM(quantity_borrowed) AS consumed
    FROM borrow_transactions
    WHERE item_id = $1
      AND borrow_date >= NOW() - INTERVAL '${windowMonths} months'
    GROUP BY 1
    ORDER BY 1 DESC
    LIMIT $2
  `, [itemId, windowMonths]);

  const rows = result.rows;
  if (!rows.length) return { sma: 0, alert: false, severity: 'ok', daysLeft: 999 };

  const sma = rows.reduce((sum, r) => sum + Number(r.consumed), 0) / rows.length;

  const stockResult = await query(
    'SELECT quantity_on_hand FROM inventory_items WHERE item_id = $1',
    [itemId]
  );
  const stock = stockResult.rows[0]?.quantity_on_hand ?? 0;

  const daysLeft = sma > 0 ? Math.round((stock / sma) * 30) : 999;
  const severity = daysLeft <= 7 ? 'critical' : daysLeft <= 30 ? 'warning' : 'ok';

  return {
    sma: Math.round(sma * 10) / 10,
    stock,
    daysLeft,
    severity,
    alert: severity !== 'ok'
  };
}