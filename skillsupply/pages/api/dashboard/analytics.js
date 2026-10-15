import { query } from '../../../lib/db.js';
import { withAuth } from '../../../lib/rbac.js';

const BORROW_STATUSES = ['Pending', 'Borrowed', 'Returned', 'Overdue', 'Active', 'Issued', 'Cancelled'];
const REQUISITION_STATUSES = ['Pending', 'Approved', 'Rejected', 'Released', 'Issued', 'Returned'];

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

function monthsBack(count) {
  const clamped = Math.min(Math.max(Number(count) || 6, 1), 36);
  return clamped - 1;
}

function monthsBetween(fromDate, toDate) {
  if (!fromDate || !toDate) return 6;
  const [y1, m1] = fromDate.split('-').map(Number);
  const [y2, m2] = toDate.split('-').map(Number);
  const diff = (y2 - y1) * 12 + (m2 - m1) + 1;
  return Math.min(Math.max(diff, 1), 36);
}

async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  res.setHeader('Cache-Control', 'no-store, max-age=0');

  try {
    const from = asDate(req.query.from);
    const to = asDate(req.query.to);
    const divisionId = asInt(req.query.division_id);
    const categoryId = asInt(req.query.category_id);
    const status = req.query.status ? asStatus(String(req.query.status), [...BORROW_STATUSES, ...REQUISITION_STATUSES]) : null;
    const borrowStatus = status && BORROW_STATUSES.includes(status) ? status : null;
    const requisitionStatus = status && REQUISITION_STATUSES.includes(status) ? status : null;

    let borrowWhere = 'WHERE 1=1';
    let invWhere = 'WHERE i.is_active = true';
    let requisitionWhere = 'WHERE 1=1';

    if (from) {
      borrowWhere += ` AND bt.borrow_date >= '${from}'`;
      requisitionWhere += ` AND r.requested_date >= '${from}'`;
    }
    if (to) {
      borrowWhere += ` AND bt.borrow_date <= '${to}'`;
      requisitionWhere += ` AND r.requested_date <= '${to}'`;
    }
    if (divisionId !== null) {
      borrowWhere += ` AND bt.division_id = ${divisionId}`;
      requisitionWhere += ` AND r.division_id = ${divisionId}`;
      invWhere += ` AND i.division_id = ${divisionId}`;
    }
    if (categoryId !== null) {
      borrowWhere += ` AND bt.item_id IN (SELECT item_id FROM inventory_items WHERE category_id = ${categoryId})`;
      requisitionWhere += ` AND r.requisition_id IN (SELECT requisition_id FROM requisition_items ri JOIN inventory_items ii ON ii.item_id = ri.item_id WHERE ii.category_id = ${categoryId})`;
      invWhere += ` AND i.category_id = ${categoryId}`;
    }
    if (borrowStatus) borrowWhere += ` AND bt.status = '${borrowStatus}'`;
    if (requisitionStatus) requisitionWhere += ` AND r.status = '${requisitionStatus}'`;

    const trendFrom = from || new Date(Date.now() - 183 * 86400000).toISOString().slice(0, 10);
    const trendTo = to || new Date().toISOString().slice(0, 10);
    const seriesEnd = trendTo;
    const seriesMonths = from || to ? monthsBetween(trendFrom, trendTo) : 6;
    const seriesBack = monthsBack(seriesMonths);

    let trendBorrowWhere = `WHERE bt.borrow_date >= '${trendFrom}' AND bt.borrow_date <= '${trendTo}'`;
    if (divisionId !== null) trendBorrowWhere += ` AND bt.division_id = ${divisionId}`;
    if (categoryId !== null) trendBorrowWhere += ` AND bt.item_id IN (SELECT item_id FROM inventory_items WHERE category_id = ${categoryId})`;
    if (borrowStatus) trendBorrowWhere += ` AND bt.status = '${borrowStatus}'`;

    const monthlyDivisions = divisionId !== null
      ? `SELECT division_id, division_name FROM divisions WHERE division_id = ${divisionId}`
      : 'SELECT division_id, division_name FROM divisions';

    const [
      kpiResult,
      divisionConsumptionResult,
      divisionDetailsResult,
      monthlyTrendResult,
      monthlyTrendByDivisionResult,
      topItemsResult,
      categoryResult,
      stockStatusResult,
      requisitionResult,
      activeUsersResult
    ] = await Promise.all([
      // KPIs
      query(`
        SELECT
          (SELECT COUNT(*) FROM inventory_items i ${invWhere}) AS total_items,
          (SELECT COUNT(*) FROM inventory_items i ${invWhere.replace('i.is_active = true', 'i.is_active = true AND i.quantity_on_hand <= i.reorder_level')}) AS low_stock,
          (SELECT COALESCE(SUM(bt.quantity_borrowed), 0) FROM borrow_transactions bt ${borrowWhere}) AS total_borrowed,
          (SELECT COALESCE(SUM(rt.quantity_returned), 0) FROM return_transactions rt JOIN borrow_transactions bt ON bt.borrow_id = rt.borrow_id ${borrowWhere}) AS total_returned,
          (SELECT COUNT(*) FROM borrow_transactions bt ${borrowWhere} AND bt.status IN ('Borrowed','Overdue')) AS items_on_loan,
          (SELECT COUNT(*) FROM borrow_transactions bt ${borrowWhere}) AS total_transactions,
          (SELECT COUNT(DISTINCT la.user_id) FROM login_audit la WHERE la.action = 'LOGIN') AS active_users,
          (SELECT COALESCE(SUM(i.unit_cost * i.quantity_on_hand), 0) FROM inventory_items i ${invWhere}) AS total_value
      `),

      // Division consumption
      query(`
        SELECT d.division_name,
          COALESCE(SUM(bt.quantity_borrowed), 0) AS issued,
          COALESCE(SUM(rt.quantity_returned), 0) AS returned
        FROM divisions d
        LEFT JOIN borrow_transactions bt ON bt.division_id = d.division_id
          ${borrowWhere.replace('WHERE 1=1', 'AND 1=1')}
        LEFT JOIN return_transactions rt ON rt.borrow_id = bt.borrow_id
        ${divisionId !== null ? `WHERE d.division_id = ${divisionId}` : ''}
        GROUP BY d.division_name
        ORDER BY issued DESC
      `),

      // Division details (items per division)
      query(`
        SELECT d.division_name,
          COUNT(i.item_id) AS total_items,
          COALESCE(SUM(i.quantity_on_hand), 0) AS total_quantity,
          COALESCE(SUM(i.unit_cost * i.quantity_on_hand), 0) AS total_value
        FROM divisions d
        LEFT JOIN inventory_items i ON i.division_id = d.division_id AND i.is_active = true
          ${categoryId !== null ? `AND i.category_id = ${categoryId}` : ''}
        ${divisionId !== null ? `WHERE d.division_id = ${divisionId}` : ''}
        GROUP BY d.division_name
        ORDER BY total_quantity DESC
      `),

      // Monthly trend
      query(`
        WITH months AS (
          SELECT to_char(date_trunc('month', $1::date) - (i || ' month')::interval, 'YYYY-MM') AS month,
                 to_char(date_trunc('month', $1::date) - (i || ' month')::interval, 'Mon YYYY') AS label
          FROM generate_series(0, ${seriesBack}) i
        ),
        issued AS (
          SELECT to_char(borrow_date, 'YYYY-MM') AS month, SUM(quantity_borrowed) AS issued
          FROM borrow_transactions
          ${trendBorrowWhere}
          GROUP BY to_char(borrow_date, 'YYYY-MM')
        ),
        returned AS (
          SELECT to_char(bt.borrow_date, 'YYYY-MM') AS month, SUM(rt.quantity_returned) AS returned
          FROM return_transactions rt
          JOIN borrow_transactions bt ON bt.borrow_id = rt.borrow_id
          ${trendBorrowWhere}
          GROUP BY to_char(bt.borrow_date, 'YYYY-MM')
        )
        SELECT m.month, m.label,
          COALESCE(i.issued, 0) AS issued,
          COALESCE(r.returned, 0) AS returned
        FROM months m
        LEFT JOIN issued i ON i.month = m.month
        LEFT JOIN returned r ON r.month = m.month
        ORDER BY m.month
      `, [seriesEnd]),

      // Monthly trend per division
      query(`
        WITH months AS (
          SELECT to_char(date_trunc('month', $1::date) - (i || ' month')::interval, 'YYYY-MM') AS month_key,
                 to_char(date_trunc('month', $1::date) - (i || ' month')::interval, 'Mon YYYY') AS label,
                 i AS sort_order
          FROM generate_series(0, ${seriesBack}) i
        ),
        per_division AS (
          ${monthlyDivisions}
        ),
        agg AS (
          SELECT bt.division_id,
            to_char(bt.borrow_date, 'YYYY-MM') AS month_key,
            SUM(bt.quantity_borrowed) AS issued
          FROM borrow_transactions bt
          ${trendBorrowWhere}
          GROUP BY bt.division_id, to_char(bt.borrow_date, 'YYYY-MM')
        )
        SELECT m.label, pd.division_name, COALESCE(a.issued, 0) AS issued
        FROM months m
        CROSS JOIN per_division pd
        LEFT JOIN agg a ON a.division_id = pd.division_id AND a.month_key = m.month_key
        ORDER BY m.sort_order DESC, pd.division_name
      `, [seriesEnd]),

      // Top consumed items
      query(`
        SELECT i.item_name, COALESCE(SUM(bt.quantity_borrowed), 0) AS total_borrowed
        FROM inventory_items i
        LEFT JOIN borrow_transactions bt ON bt.item_id = i.item_id
          ${borrowWhere.replace('WHERE 1=1', 'AND 1=1')}
        WHERE i.is_active = true
          ${categoryId !== null ? `AND i.category_id = ${categoryId}` : ''}
          ${divisionId !== null ? `AND i.division_id = ${divisionId}` : ''}
        GROUP BY i.item_name
        ORDER BY total_borrowed DESC
        LIMIT 5
      `),

      // Category breakdown
      query(`
        SELECT c.category_name, COUNT(i.item_id) AS item_count,
          COALESCE(SUM(i.quantity_on_hand), 0) AS total_qty
        FROM categories c
        LEFT JOIN inventory_items i ON i.category_id = c.category_id AND i.is_active = true
          ${divisionId !== null ? `AND i.division_id = ${divisionId}` : ''}
        ${categoryId !== null ? `WHERE c.category_id = ${categoryId}` : ''}
        GROUP BY c.category_name
        ORDER BY total_qty DESC
      `),

      // Stock status
      query(`
        SELECT
          COUNT(CASE WHEN i.quantity_on_hand <= i.reorder_level THEN 1 END) AS critical,
          COUNT(CASE WHEN i.quantity_on_hand > i.reorder_level AND i.quantity_on_hand <= i.reorder_level * 1.5 THEN 1 END) AS low,
          COUNT(CASE WHEN i.quantity_on_hand > i.reorder_level * 1.5 THEN 1 END) AS sufficient
        FROM inventory_items i
        ${invWhere}
      `),

      // Requisitions by division
      query(`
        SELECT d.division_name,
          COALESCE(SUM(CASE WHEN r.status = 'Pending' THEN 1 ELSE 0 END), 0) AS pending,
          COALESCE(SUM(CASE WHEN r.status = 'Approved' THEN 1 ELSE 0 END), 0) AS approved,
          COALESCE(SUM(CASE WHEN r.status = 'Released' THEN 1 ELSE 0 END), 0) AS released,
          COALESCE(SUM(CASE WHEN r.status = 'Rejected' THEN 1 ELSE 0 END), 0) AS rejected
        FROM divisions d
        LEFT JOIN requisitions r ON r.division_id = d.division_id
          ${requisitionWhere.replace('WHERE 1=1', 'AND 1=1')}
        ${divisionId !== null ? `WHERE d.division_id = ${divisionId}` : ''}
        GROUP BY d.division_name
        ORDER BY d.division_name
      `),

      // Active users count
      query(`SELECT COUNT(*) AS total FROM users WHERE is_active = true`)
    ]);

    const kpi = kpiResult.rows[0];
    const totalBorrowed = parseInt(kpi.total_borrowed, 10);
    const totalReturned = parseInt(kpi.total_returned, 10);
    const returnRate = totalBorrowed > 0 ? Math.round((totalReturned / totalBorrowed) * 100) : 0;

    return res.status(200).json({
      applied_filters: { from, to, division_id: divisionId, category_id: categoryId, status },
      kpis: {
        totalItems: parseInt(kpi.total_items, 10),
        lowStock: parseInt(kpi.low_stock, 10),
        itemsOnLoan: parseInt(kpi.items_on_loan, 10),
        totalTransactions: parseInt(kpi.total_transactions, 10),
        returnRate,
        totalValue: parseFloat(kpi.total_value || 0)
      },
      divisionConsumption: divisionConsumptionResult.rows.map(r => ({
        division: r.division_name,
        issued: parseInt(r.issued, 10),
        returned: parseInt(r.returned, 10)
      })),
      divisionDetails: divisionDetailsResult.rows.map(r => ({
        division: r.division_name,
        totalItems: parseInt(r.total_items, 10),
        totalQuantity: parseInt(r.total_quantity, 10),
        totalValue: parseFloat(r.total_value)
      })),
      monthlyTrend: monthlyTrendResult.rows.map(r => ({
        month: r.label,
        issued: parseInt(r.issued, 10),
        returned: parseInt(r.returned, 10)
      })),
      monthlyTrendByDivision: monthlyTrendByDivisionResult.rows.map(r => ({
        month: r.label,
        division: r.division_name,
        issued: parseInt(r.issued, 10)
      })),
      topItems: topItemsResult.rows.map(r => ({
        name: r.item_name,
        borrowed: parseInt(r.total_borrowed, 10)
      })),
      categories: categoryResult.rows.map(r => ({
        name: r.category_name,
        count: parseInt(r.item_count, 10),
        quantity: parseInt(r.total_qty, 10)
      })),
      stockStatus: {
        critical: parseInt(stockStatusResult.rows[0].critical, 10),
        low: parseInt(stockStatusResult.rows[0].low, 10),
        sufficient: parseInt(stockStatusResult.rows[0].sufficient, 10)
      },
      requisitions: requisitionResult.rows.map(r => ({
        division: r.division_name,
        pending: parseInt(r.pending, 10),
        approved: parseInt(r.approved, 10),
        released: parseInt(r.released, 10),
        rejected: parseInt(r.rejected, 10)
      })),
      activeUsers: parseInt(activeUsersResult.rows[0].total, 10)
    });
  } catch (err) {
    console.error('Analytics API error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}

export default withAuth(handler, 1);
