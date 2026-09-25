import { query } from './db.js';

export async function computeSMA(itemId, windowMonths = 3) {
  const result = await query(`
    SELECT month, SUM(consumed) AS consumed FROM (
      SELECT DATE_TRUNC('month', bt.created_at) AS month,
             SUM(bt.quantity_borrowed) AS consumed
      FROM borrow_transactions bt
      WHERE bt.item_id = $1
        AND bt.created_at >= NOW() - INTERVAL '${windowMonths} months'
      GROUP BY 1
      UNION ALL
      SELECT DATE_TRUNC('month', r.requested_date) AS month,
             SUM(COALESCE(NULLIF(ri.quantity_issued, 0), ri.quantity_approved, ri.quantity_requested)) AS consumed
      FROM requisition_items ri
      JOIN requisitions r ON r.requisition_id = ri.requisition_id
      WHERE ri.item_id = $1
        AND r.status = 'Approved'
        AND r.requested_date >= NOW() - INTERVAL '${windowMonths} months'
      GROUP BY 1
    ) combined
    GROUP BY 1
    ORDER BY 1 DESC
    LIMIT $2
  `, [itemId, windowMonths]);

  const rows = result.rows;
  if (!rows.length) return { sma: 0, daysLeft: null, severity: 'ok' };

  const sma = rows.reduce((sum, r) => sum + Number(r.consumed), 0) / rows.length;

  const stockResult = await query(
    'SELECT quantity_on_hand FROM inventory_items WHERE item_id = $1',
    [itemId]
  );
  const stock = stockResult.rows[0]?.quantity_on_hand ?? 0;

  const daysLeft = sma > 0 ? Math.round((stock / sma) * 30) : null;
  const severity = daysLeft === null ? 'ok' : daysLeft <= 7 ? 'critical' : daysLeft <= 30 ? 'warning' : 'ok';

  return {
    sma: Math.round(sma * 10) / 10,
    stock,
    daysLeft,
    severity,
  };
}
