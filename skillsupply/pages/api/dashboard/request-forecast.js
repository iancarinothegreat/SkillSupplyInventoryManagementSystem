import { query } from '../../../lib/db.js';
import { withAuth } from '../../../lib/rbac.js';

const REQUISITION_STATUSES = ['Pending', 'Approved', 'Rejected', 'Released', 'Issued', 'Returned'];
const BORROW_STATUSES = ['Pending', 'Borrowed', 'Returned', 'Overdue', 'Active', 'Issued', 'Cancelled'];

function asInt(value) {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

function asDate(value) {
  if (!value) return null;
  const match = String(value).match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : null;
}

function asStatus(value, allowed) {
  return allowed.includes(value) ? value : null;
}

function predictDivision(monthly, monthsWindow) {
  const counts = monthly.map((m) => Number(m.count) || 0);
  const total = counts.reduce((sum, v) => sum + v, 0);
  const avg = monthsWindow > 0 ? total / monthsWindow : 0;
  const peak = counts.length ? Math.max(...counts) : 0;

  const half = Math.floor(counts.length / 2);
  const recent = counts.slice(-half);
  const earlier = counts.slice(0, half);
  const recentAvg = recent.length ? recent.reduce((s, v) => s + v, 0) / recent.length : avg;
  const earlierAvg = earlier.length ? earlier.reduce((s, v) => s + v, 0) / earlier.length : avg;

  let growth = earlierAvg > 0 ? recentAvg / earlierAvg : 1;
  if (!Number.isFinite(growth)) growth = 1;
  growth = Math.min(Math.max(growth, 0.9), 1.3);

  const predicted = Math.ceil(Math.max(peak, avg * growth, 1));

  return { total, avg, peak, predicted };
}

async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  res.setHeader('Cache-Control', 'no-store, max-age=0');

  try {
    const from = asDate(req.query.from);
    const to = asDate(req.query.to);
    const divisionId = asInt(req.query.division_id);
    const categoryId = asInt(req.query.category_id);
    const status = req.query.status ? String(req.query.status) : null;

    const requisitionStatus = status && REQUISITION_STATUSES.includes(status) ? status : null;
    const borrowStatus = status && BORROW_STATUSES.includes(status) ? status : null;

    const rangeStart = from || new Date(Date.now() - 183 * 86400000).toISOString().slice(0, 10);
    const rangeEnd = to || new Date().toISOString().slice(0, 10);

    let reqWhere = `WHERE r.created_at >= '${rangeStart}' AND r.created_at < ('${rangeEnd}'::date + 1)`;
    if (divisionId !== null) reqWhere += ` AND r.division_id = ${divisionId}`;
    if (requisitionStatus) reqWhere += ` AND r.status = '${requisitionStatus}'`;
    if (categoryId !== null) {
      reqWhere += ` AND r.requisition_id IN (SELECT requisition_id FROM requisition_items ri JOIN inventory_items ii ON ii.item_id = ri.item_id WHERE ii.category_id = ${categoryId})`;
    }

    let borWhere = `WHERE bt.created_at >= '${rangeStart}' AND bt.created_at < ('${rangeEnd}'::date + 1)`;
    if (divisionId !== null) borWhere += ` AND bt.division_id = ${divisionId}`;
    if (borrowStatus) borWhere += ` AND bt.status = '${borrowStatus}'`;
    if (categoryId !== null) {
      borWhere += ` AND bt.item_id IN (SELECT item_id FROM inventory_items WHERE category_id = ${categoryId})`;
    }

    const result = await query(`
      WITH months AS (
        SELECT generate_series(
          date_trunc('month', '${rangeStart}'::date),
          date_trunc('month', '${rangeEnd}'::date),
          interval '1 month'
        )::date AS month_start
      ),
      req_counts AS (
        SELECT r.division_id, date_trunc('month', r.created_at)::date AS month_start, COUNT(*) AS cnt
        FROM requisitions r
        ${reqWhere}
        GROUP BY r.division_id, date_trunc('month', r.created_at)
      ),
      bor_counts AS (
        SELECT bt.division_id, date_trunc('month', bt.created_at)::date AS month_start, COUNT(*) AS cnt
        FROM borrow_transactions bt
        ${borWhere}
        GROUP BY bt.division_id, date_trunc('month', bt.created_at)
      ),
      combined AS (
        SELECT division_id, month_start, SUM(cnt) AS cnt FROM req_counts GROUP BY division_id, month_start
        UNION ALL
        SELECT division_id, month_start, SUM(cnt) AS cnt FROM bor_counts GROUP BY division_id, month_start
      ),
      series AS (
        SELECT d.division_id, d.division_name, m.month_start
        FROM divisions d
        CROSS JOIN months m
        ${divisionId !== null ? `WHERE d.division_id = ${divisionId}` : ''}
      )
      SELECT s.division_id, s.division_name,
        to_char(s.month_start, 'Mon YYYY') AS month,
        COALESCE(SUM(c.cnt), 0) AS count
      FROM series s
      LEFT JOIN combined c ON c.division_id = s.division_id AND c.month_start = s.month_start
      GROUP BY s.division_id, s.division_name, s.month_start
      ORDER BY s.division_name, s.month_start
    `);

    const grouped = new Map();
    for (const row of result.rows) {
      const key = row.division_id;
      if (!grouped.has(key)) grouped.set(key, { division: row.division_name, monthly: [] });
      grouped.get(key).monthly.push({ month: row.month, count: parseInt(row.count, 10) });
    }

    const monthsWindow = result.rows.length && grouped.size
      ? Math.max(grouped.values().next().value.monthly.length, 1)
      : 6;

    const rows = [...grouped.values()].map(({ division, monthly }) => {
      const stats = predictDivision(monthly, monthsWindow);
      return {
        division,
        total_requests: stats.total,
        historical_avg: Number(stats.avg.toFixed(1)),
        peak_month: stats.peak,
        predicted_max: stats.predicted,
        monthly
      };
    });

    rows.sort((a, b) => b.predicted_max - a.predicted_max);

    return res.status(200).json({
      window_months: monthsWindow,
      range: { from: rangeStart, to: rangeEnd },
      rows
    });
  } catch (err) {
    console.error('Request forecast API error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}

export default withAuth(handler, 1);
