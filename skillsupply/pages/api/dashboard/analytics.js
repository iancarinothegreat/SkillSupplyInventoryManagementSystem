import { query } from '../../../lib/db.js';
import { withAuth } from '../../../lib/rbac.js';

async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { from, to, division_id, category_id, status } = req.query;

    let borrowWhere = 'WHERE 1=1';
    let invWhere = 'WHERE i.is_active = true';
    const params = [];
    let paramIdx = 1;

    if (from) {
      borrowWhere += ` AND bt.borrow_date >= $${paramIdx}`;
      params.push(from);
      paramIdx++;
    }
    if (to) {
      borrowWhere += ` AND bt.borrow_date <= $${paramIdx}`;
      params.push(to);
      paramIdx++;
    }
    if (division_id) {
      borrowWhere += ` AND bt.division_id = $${paramIdx}`;
      params.push(division_id);
      paramIdx++;
      invWhere += ` AND i.division_id = $${paramIdx}`;
      params.push(division_id);
      paramIdx++;
    }
    if (category_id) {
      invWhere += ` AND i.category_id = $${paramIdx}`;
      params.push(category_id);
      paramIdx++;
    }

    const monthlyDivParams = division_id ? [division_id] : [];

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
          (SELECT COALESCE(SUM(rt.quantity_returned), 0) FROM return_transactions rt JOIN borrow_transactions bt ON bt.borrow_id = rt.borrow_id ${borrowWhere.replace('bt.borrow_date', 'bt.borrow_date')}) AS total_returned,
          (SELECT COUNT(*) FROM borrow_transactions bt ${borrowWhere} AND bt.status IN ('Borrowed','Overdue')) AS items_on_loan,
          (SELECT COUNT(*) FROM borrow_transactions bt ${borrowWhere}) AS total_transactions,
          (SELECT COUNT(DISTINCT la.user_id) FROM login_audit la WHERE la.action = 'LOGIN') AS active_users,
          (SELECT COALESCE(SUM(i.unit_cost * i.quantity_on_hand), 0) FROM inventory_items i WHERE i.is_active = true) AS total_value
      `, params),

      // Division consumption
      query(`
        SELECT d.division_name,
          COALESCE(SUM(bt.quantity_borrowed), 0) AS issued,
          COALESCE(SUM(rt.quantity_returned), 0) AS returned
        FROM divisions d
        LEFT JOIN borrow_transactions bt ON bt.division_id = d.division_id ${from ? `AND bt.borrow_date >= '${from}'` : ''} ${to ? `AND bt.borrow_date <= '${to}'` : ''}
        LEFT JOIN return_transactions rt ON rt.borrow_id = bt.borrow_id
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
        GROUP BY d.division_name
        ORDER BY total_quantity DESC
      `),

      // Monthly trend (last 6 months)
      query(`
        WITH months AS (
          SELECT to_char(now() - (i || ' month')::interval, 'YYYY-MM') AS month,
                 to_char(now() - (i || ' month')::interval, 'Mon YYYY') AS label
          FROM generate_series(0, 5) i
        ),
        issued AS (
          SELECT to_char(borrow_date, 'YYYY-MM') AS month, SUM(quantity_borrowed) AS issued
          FROM borrow_transactions
          WHERE borrow_date >= now() - interval '6 months'
          GROUP BY to_char(borrow_date, 'YYYY-MM')
        ),
        returned AS (
          SELECT to_char(bt.borrow_date, 'YYYY-MM') AS month, SUM(rt.quantity_returned) AS returned
          FROM return_transactions rt
          JOIN borrow_transactions bt ON bt.borrow_id = rt.borrow_id
          WHERE bt.borrow_date >= now() - interval '6 months'
          GROUP BY to_char(bt.borrow_date, 'YYYY-MM')
        )
        SELECT m.month, m.label,
          COALESCE(i.issued, 0) AS issued,
          COALESCE(r.returned, 0) AS returned
        FROM months m
        LEFT JOIN issued i ON i.month = m.month
        LEFT JOIN returned r ON r.month = m.month
        ORDER BY m.month
      `),

      // Monthly trend per division (last 6 months)
      query(`
        WITH months AS (
          SELECT to_char(now() - (i || ' month')::interval, 'YYYY-MM') AS month_key,
                 to_char(now() - (i || ' month')::interval, 'Mon YYYY') AS label,
                 i AS sort_order
          FROM generate_series(0, 5) i
        ),
        per_division AS (
          SELECT division_id, division_name FROM divisions
          ${division_id ? 'WHERE division_id = $1' : ''}
        ),
        agg AS (
          SELECT bt.division_id,
            to_char(bt.borrow_date, 'YYYY-MM') AS month_key,
            SUM(bt.quantity_borrowed) AS issued
          FROM borrow_transactions bt
          WHERE bt.borrow_date >= now() - interval '6 months'
            ${division_id ? 'AND bt.division_id = $1' : ''}
          GROUP BY bt.division_id, to_char(bt.borrow_date, 'YYYY-MM')
        )
        SELECT m.label, pd.division_name, COALESCE(a.issued, 0) AS issued
        FROM months m
        CROSS JOIN per_division pd
        LEFT JOIN agg a ON a.division_id = pd.division_id AND a.month_key = m.month_key
        ORDER BY m.sort_order DESC, pd.division_name
      `, monthlyDivParams),

      // Top consumed items
      query(`
        SELECT i.item_name, COALESCE(SUM(bt.quantity_borrowed), 0) AS total_borrowed
        FROM inventory_items i
        LEFT JOIN borrow_transactions bt ON bt.item_id = i.item_id ${from ? `AND bt.borrow_date >= '${from}'` : ''} ${to ? `AND bt.borrow_date <= '${to}'` : ''}
        WHERE i.is_active = true
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
        GROUP BY c.category_name
        ORDER BY total_qty DESC
      `),

      // Stock status
      query(`
        SELECT
          COUNT(CASE WHEN i.quantity_on_hand = 0 THEN 1 END) AS out_of_stock,
          COUNT(CASE WHEN i.quantity_on_hand > 0 AND i.quantity_on_hand <= i.reorder_level THEN 1 END) AS low_stock,
          COUNT(CASE WHEN i.quantity_on_hand > i.reorder_level THEN 1 END) AS in_stock
        FROM inventory_items i
        WHERE i.is_active = true
      `),

      // Requisitions by division
      query(`
        SELECT d.division_name,
          COALESCE(SUM(CASE WHEN r.status = 'Pending' THEN 1 ELSE 0 END), 0) AS pending,
          COALESCE(SUM(CASE WHEN r.status = 'Approved' THEN 1 ELSE 0 END), 0) AS approved,
          COALESCE(SUM(CASE WHEN r.status = 'Rejected' THEN 1 ELSE 0 END), 0) AS rejected
        FROM divisions d
        LEFT JOIN requisitions r ON r.division_id = d.division_id
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
        outOfStock: parseInt(stockStatusResult.rows[0].out_of_stock, 10),
        lowStock: parseInt(stockStatusResult.rows[0].low_stock, 10),
        inStock: parseInt(stockStatusResult.rows[0].in_stock, 10)
      },
      requisitions: requisitionResult.rows.map(r => ({
        division: r.division_name,
        pending: parseInt(r.pending, 10),
        approved: parseInt(r.approved, 10),
        rejected: parseInt(r.rejected, 10)
      }))
    });
  } catch (err) {
    console.error('Analytics API error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}

export default withAuth(handler, 1);
