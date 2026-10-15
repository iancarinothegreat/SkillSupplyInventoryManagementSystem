import { withAuth } from '../../../lib/rbac';
import db from '../../../lib/db';
import xlsx from 'xlsx';

async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  const user = req.user;
  const { report = 'inventory', from, to, division } = req.query;

  try {
    const workbook = xlsx.utils.book_new();
    const sheetName = getReportTitle(report);

    if (report === 'inventory') {
      let query = `
        SELECT i.item_name AS name, c.category_name AS category, i.quantity_on_hand AS quantity, i.unit_of_measure AS unit, i.reorder_level AS reorder_point, i.unit_cost AS unit_price
        FROM inventory_items i
        LEFT JOIN categories c ON i.category_id = c.category_id
        WHERE i.is_active = true
      `;
      const params = [];
      if (division && division !== 'all') {
        params.push(division);
        query += ` AND i.division_id = $${params.length}`;
      }
      query += ' ORDER BY c.category_name, i.item_name';
      const { rows } = await db.query(query, params);
      const data = rows.map((r) => ({
        'Item Name': r.name,
        'Category': r.category || '—',
        'Quantity': r.quantity,
        'Unit': r.unit || '—',
        'Reorder Point': r.reorder_point,
        'Unit Price': r.unit_price || 0,
        'Status': r.quantity <= r.reorder_point ? 'Critical' : r.quantity <= r.reorder_point * 1.5 ? 'Low Stock' : 'In Stock',
      }));
      const ws = xlsx.utils.json_to_sheet(data);
      xlsx.utils.book_append_sheet(workbook, ws, 'Inventory');
    } else if (report === 'transactions') {
      let query = `
        SELECT bt.borrow_id AS id, i.item_name, bt.borrower_name, d.division_name AS borrower_division,
               bt.quantity_borrowed AS quantity, bt.borrow_date, bt.expected_return_date, bt.status
        FROM borrow_transactions bt
        LEFT JOIN inventory_items i ON bt.item_id = i.item_id
        LEFT JOIN divisions d ON bt.division_id = d.division_id
        WHERE 1=1
      `;
      const params = [];
      if (from) { params.push(from); query += ` AND bt.borrow_date >= $${params.length}`; }
      if (to) { params.push(to); query += ` AND bt.borrow_date <= $${params.length}`; }
      if (division && division !== 'all') { params.push(division); query += ` AND bt.division_id = $${params.length}`; }
      query += ' ORDER BY bt.borrow_date DESC LIMIT 200';

      const { rows } = await db.query(query, params);
      const data = rows.map((r) => ({
        'ID': r.id,
        'Item': r.item_name || '—',
        'Borrower': r.borrower_name || '—',
        'Division': r.borrower_division || '—',
        'Quantity': r.quantity,
        'Borrow Date': new Date(r.borrow_date).toLocaleDateString(),
        'Expected Return': r.expected_return_date ? new Date(r.expected_return_date).toLocaleDateString() : '—',
        'Status': r.status || 'Borrowed',
      }));
      const ws = xlsx.utils.json_to_sheet(data);
      xlsx.utils.book_append_sheet(workbook, ws, 'Transactions');
    } else if (report === 'lowstock') {
      let query = `
        SELECT i.item_name AS name, c.category_name AS category, i.quantity_on_hand AS quantity, i.reorder_level AS reorder_point, i.unit_of_measure AS unit
        FROM inventory_items i
        LEFT JOIN categories c ON i.category_id = c.category_id
        WHERE i.quantity_on_hand <= i.reorder_level
      `;
      const params = [];
      if (division && division !== 'all') { params.push(division); query += ` AND i.division_id = $${params.length}`; }
      query += ' ORDER BY i.quantity_on_hand ASC';
      const { rows } = await db.query(query, params);
      const data = rows.map((r) => ({
        'Item Name': r.name,
        'Category': r.category || '—',
        'Stock': r.quantity,
        'Unit': r.unit || '—',
        'Reorder Point': r.reorder_point,
        'Deficit': Math.max(0, r.reorder_point - r.quantity),
        'Status': r.quantity <= r.reorder_point ? 'Critical' : 'Reorder',
      }));
      const ws = xlsx.utils.json_to_sheet(data);
      xlsx.utils.book_append_sheet(workbook, ws, 'Low Stock');
    } else if (report === 'consumption') {
      let query = `
        SELECT i.item_name, COUNT(*) AS times_borrowed,
               SUM(bt.quantity_borrowed) AS total_borrowed,
               SUM(CASE WHEN bt.status = 'Returned' THEN bt.quantity_borrowed ELSE 0 END) AS total_returned
        FROM borrow_transactions bt
        LEFT JOIN inventory_items i ON bt.item_id = i.item_id
        WHERE 1=1
      `;
      const params = [];
      if (from) { params.push(from); query += ` AND bt.borrow_date >= $${params.length}`; }
      if (to) { params.push(to); query += ` AND bt.borrow_date <= $${params.length}`; }
      if (division && division !== 'all') { params.push(division); query += ` AND bt.division_id = $${params.length}`; }
      query += ' GROUP BY i.item_name ORDER BY total_borrowed DESC';

      const { rows } = await db.query(query, params);
      const data = rows.map((r) => ({
        'Item': r.item_name || '—',
        'Times Borrowed': r.times_borrowed,
        'Total Borrowed': r.total_borrowed,
        'Total Returned': r.total_returned,
        'Currently Out': (parseInt(r.total_borrowed) || 0) - (parseInt(r.total_returned) || 0),
      }));
      const ws = xlsx.utils.json_to_sheet(data);
      xlsx.utils.book_append_sheet(workbook, ws, 'Consumption');
    } else if (report === 'dashboard') {
      let invQuery = `
        SELECT COUNT(*) AS total_items,
               SUM(quantity_on_hand) AS total_stock,
               SUM(CASE WHEN quantity_on_hand = 0 THEN 1 ELSE 0 END) AS out_of_stock,
               SUM(CASE WHEN quantity_on_hand > 0 AND quantity_on_hand <= reorder_level THEN 1 ELSE 0 END) AS low_stock,
               SUM(quantity_on_hand * unit_cost) AS total_value
        FROM inventory_items
        WHERE is_active = true
      `;
      const invParams = [];
      if (division && division !== 'all') { invParams.push(division); invQuery += ` AND division_id = $${invParams.length}`; }
      const invResult = await db.query(invQuery, invParams);
      const inv = invResult.rows[0];

      let txWhere = 'WHERE 1=1';
      const txParams = [];
      if (from) { txParams.push(from); txWhere += ` AND bt.borrow_date >= $${txParams.length}`; }
      if (to) { txParams.push(to); txWhere += ` AND bt.borrow_date <= $${txParams.length}`; }
      if (division && division !== 'all') { txParams.push(division); txWhere += ` AND bt.division_id = $${txParams.length}`; }

      const txResult = await db.query(`
        SELECT
          COUNT(*) AS total_transactions,
          SUM(CASE WHEN status = 'Borrowed' THEN 1 ELSE 0 END) AS borrowed,
          SUM(CASE WHEN status = 'Overdue' THEN 1 ELSE 0 END) AS overdue,
          SUM(CASE WHEN status = 'Returned' THEN 1 ELSE 0 END) AS returned,
          SUM(quantity_borrowed) AS total_borrowed_qty
        FROM borrow_transactions bt
        ${txWhere}
      `, txParams);
      const tx = txResult.rows[0];

      const summaryData = [
        { 'Metric': 'Total Items', 'Value': inv.total_items },
        { 'Metric': 'Total Stock Units', 'Value': inv.total_stock || 0 },
        { 'Metric': 'Critical Stock', 'Value': inv.out_of_stock },
        { 'Metric': 'Low Stock', 'Value': inv.low_stock },
        { 'Metric': 'Estimated Total Value (₱)', 'Value': parseFloat(inv.total_value || 0).toFixed(2) },
        { 'Metric': '', 'Value': '' },
        { 'Metric': 'Total Transactions', 'Value': tx.total_transactions },
        { 'Metric': 'Currently Borrowed', 'Value': tx.borrowed },
        { 'Metric': 'Overdue', 'Value': tx.overdue },
        { 'Metric': 'Returned', 'Value': tx.returned },
        { 'Metric': 'Total Quantity Borrowed', 'Value': tx.total_borrowed_qty || 0 },
      ];
      const ws = xlsx.utils.json_to_sheet(summaryData);
      xlsx.utils.book_append_sheet(workbook, ws, 'Dashboard Summary');
    } else {
      return res.status(400).json({ message: 'Invalid report type.' });
    }

    const buffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=SkillSupply_${report}_${new Date().toISOString().slice(0, 10)}.xlsx`
    );
    res.send(buffer);
  } catch (err) {
    console.error('Excel export error:', err);
    res.status(500).json({ message: 'Failed to generate Excel.' });
  }
}

function getReportTitle(report) {
  const titles = {
    inventory: 'Inventory Status Report',
    transactions: 'Transaction Log Report',
    lowstock: 'Low Stock Alert Report',
    consumption: 'Consumption Report',
    dashboard: 'Dashboard Summary Report',
  };
  return titles[report] || 'Supply Report';
}

export default withAuth(handler, 1);
