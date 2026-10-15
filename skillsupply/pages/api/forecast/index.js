import { query } from '../../../lib/db.js';
import { withAuth } from '../../../lib/rbac.js';

async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  try {
    const requestedWindow = Number.parseInt(req.query.window, 10);
    const windowMonths = Number.isFinite(requestedWindow)
      ? Math.min(Math.max(requestedWindow, 1), 24)
      : 3;

    // Calculate all item SMAs in one query. The previous implementation ran
    // multiple queries per item concurrently, which could exhaust Supabase's
    // connection pool on Vercel.
    const result = await query(
      `WITH monthly_consumption AS (
         SELECT bt.item_id,
                DATE_TRUNC('month', bt.created_at) AS month,
                SUM(bt.quantity_borrowed)::numeric AS consumed
         FROM borrow_transactions bt
         WHERE bt.created_at >= NOW() - ($1::int * INTERVAL '1 month')
         GROUP BY bt.item_id, DATE_TRUNC('month', bt.created_at)

         UNION ALL

         SELECT ri.item_id,
                DATE_TRUNC('month', r.requested_date) AS month,
                SUM(COALESCE(NULLIF(ri.quantity_issued, 0), ri.quantity_approved, ri.quantity_requested))::numeric AS consumed
         FROM requisition_items ri
         JOIN requisitions r ON r.requisition_id = ri.requisition_id
         WHERE r.status = 'Approved'
           AND r.requested_date >= NOW() - ($1::int * INTERVAL '1 month')
         GROUP BY ri.item_id, DATE_TRUNC('month', r.requested_date)
       ),
       monthly_totals AS (
         SELECT item_id, month, SUM(consumed) AS consumed
         FROM monthly_consumption
         GROUP BY item_id, month
       ),
       item_smas AS (
         SELECT item_id, AVG(consumed) AS sma
         FROM monthly_totals
         GROUP BY item_id
       )
       SELECT i.item_id,
              i.item_name,
              i.division_id,
              COALESCE(i.quantity_on_hand, 0) AS stock,
              i.unit_of_measure,
              COALESCE(i.reorder_level, 0) AS reorder_point,
              c.category_name,
              COALESCE(s.sma, 0) AS sma
       FROM inventory_items i
       LEFT JOIN categories c ON i.category_id = c.category_id
       LEFT JOIN item_smas s ON s.item_id = i.item_id
       WHERE i.is_active = true`
      , [windowMonths]
    );

    const forecasts = result.rows.map(item => {
      const stock = Number(item.stock) || 0;
      const sma = Math.round((Number(item.sma) || 0) * 10) / 10;
      const daysLeft = sma > 0 ? Math.round((stock / sma) * 30) : null;

      return {
        item_id: item.item_id,
        item_name: item.item_name,
        division_id: item.division_id,
        stock,
        unit_of_measure: item.unit_of_measure,
        reorder_point: Number(item.reorder_point) || 0,
        category_name: item.category_name,
        sma,
        days_left: daysLeft,
        severity: daysLeft === null ? 'ok' : daysLeft <= 7 ? 'critical' : daysLeft <= 30 ? 'warning' : 'ok',
      };
    });

    const storedForecasts = forecasts.filter((forecast) => forecast.division_id !== null && forecast.division_id !== undefined);
    if (storedForecasts.length > 0) {
      const placeholders = storedForecasts.map((forecast, index) => {
        const offset = index * 6;
        return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6})`;
      }).join(', ');

      await query(`
        INSERT INTO forecast_data
          (item_id, division_id, forecast_date, sma_value, days_to_depletion, risk_level)
        VALUES ${placeholders}
        ON CONFLICT (item_id, division_id, forecast_date)
        DO UPDATE SET
          sma_value = EXCLUDED.sma_value,
          days_to_depletion = EXCLUDED.days_to_depletion,
          risk_level = EXCLUDED.risk_level
      `, storedForecasts.flatMap((forecast) => {
        return [
          forecast.item_id,
          forecast.division_id,
          new Date().toISOString().slice(0, 10),
          forecast.sma,
          forecast.days_left,
          forecast.severity === 'critical' ? 'Critical' : forecast.severity === 'warning' ? 'Warning' : 'Safe',
        ];
      }));
    }

    forecasts.sort((a, b) => a.item_name.localeCompare(b.item_name));
    return res.status(200).json(forecasts);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
}

export default withAuth(handler, 2);
