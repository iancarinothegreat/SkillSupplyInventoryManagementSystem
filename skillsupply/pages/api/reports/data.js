import { withAuth } from '../../../lib/rbac';
import db from '../../../lib/db';
import PDFDocument from 'pdfkit';
import { computeSMA } from '../../../lib/sma';

const REPORTS = {
  dashboard: {
    title: 'Dashboard Summary',
    query: `SELECT COUNT(*) AS "Total Items", COALESCE(SUM(i.quantity_on_hand), 0) AS "Total Stock Units", COALESCE(SUM(CASE WHEN i.quantity_on_hand = 0 THEN 1 ELSE 0 END), 0) AS "Out of Stock", COALESCE(SUM(CASE WHEN i.quantity_on_hand > 0 AND i.quantity_on_hand <= i.reorder_level THEN 1 ELSE 0 END), 0) AS "Low Stock", COALESCE(SUM(i.quantity_on_hand * COALESCE(i.unit_cost, 0)), 0) AS "Inventory Value" FROM inventory_items i WHERE i.is_active = true`,
    filters: ['division'],
  },
  inventory: {
    title: 'Inventory Status',
    query: `SELECT i.item_name AS "Item", c.category_name AS "Category", d.division_name AS "Division", i.quantity_on_hand AS "Quantity", i.unit_of_measure AS "Unit", i.reorder_level AS "Reorder Point", i.unit_cost AS "Unit Cost", CASE WHEN i.quantity_on_hand = 0 THEN 'Out of Stock' WHEN i.quantity_on_hand <= i.reorder_level THEN 'Low Stock' ELSE 'In Stock' END AS "Status" FROM inventory_items i LEFT JOIN categories c ON i.category_id = c.category_id LEFT JOIN divisions d ON i.division_id = d.division_id WHERE i.is_active = true`,
    filters: ['division', 'category', 'status'],
  },
  inventory_value: {
    title: 'Inventory Valuation',
    query: `SELECT c.category_name AS "Category", COUNT(i.item_id) AS "Items", SUM(i.quantity_on_hand) AS "Units", SUM(i.quantity_on_hand * COALESCE(i.unit_cost, 0)) AS "Value" FROM inventory_items i LEFT JOIN categories c ON i.category_id = c.category_id WHERE i.is_active = true GROUP BY c.category_name`,
    filters: ['category'],
  },
  lowstock: {
    title: 'Critical Reorder Report',
    query: `SELECT i.item_name AS "Item", c.category_name AS "Category", d.division_name AS "Division", i.quantity_on_hand AS "Current Stock", i.unit_of_measure AS "Unit", i.reorder_level AS "Reorder Point", GREATEST(i.reorder_level - i.quantity_on_hand, 0) AS "Shortage", CASE WHEN i.quantity_on_hand = 0 THEN CONCAT('Critical because there is no stock available. Reorder at ', i.reorder_level, ' ', COALESCE(i.unit_of_measure, 'units'), '.') ELSE CONCAT('Critical because current stock is ', GREATEST(i.reorder_level - i.quantity_on_hand, 0), ' ', COALESCE(i.unit_of_measure, 'units'), ' below the reorder point of ', i.reorder_level, ' ', COALESCE(i.unit_of_measure, 'units'), '.') END AS "Why Critical" FROM inventory_items i LEFT JOIN categories c ON i.category_id = c.category_id LEFT JOIN divisions d ON i.division_id = d.division_id WHERE i.is_active = true AND i.quantity_on_hand <= i.reorder_level`,
    filters: ['division', 'category'],
  },
  outofstock: {
    title: 'Out of Stock',
    query: `SELECT i.item_name AS "Item", c.category_name AS "Category", d.division_name AS "Division", i.reorder_level AS "Reorder Point" FROM inventory_items i LEFT JOIN categories c ON i.category_id = c.category_id LEFT JOIN divisions d ON i.division_id = d.division_id WHERE i.is_active = true AND i.quantity_on_hand = 0`,
    filters: ['division', 'category'],
  },
  inventory_category: {
    title: 'Inventory by Category',
    query: `SELECT c.category_name AS "Category", COUNT(i.item_id) AS "Items", SUM(i.quantity_on_hand) AS "Units", SUM(i.quantity_on_hand * COALESCE(i.unit_cost, 0)) AS "Value" FROM inventory_items i LEFT JOIN categories c ON i.category_id = c.category_id WHERE i.is_active = true GROUP BY c.category_name`,
    filters: ['category'],
  },
  inventory_division: {
    title: 'Inventory by Division',
    query: `SELECT d.division_name AS "Division", COUNT(i.item_id) AS "Items", SUM(i.quantity_on_hand) AS "Units", SUM(i.quantity_on_hand * COALESCE(i.unit_cost, 0)) AS "Value" FROM inventory_items i LEFT JOIN divisions d ON i.division_id = d.division_id WHERE i.is_active = true GROUP BY d.division_name`,
    filters: ['division'],
  },
  defective: {
    title: 'Defective Stock',
    query: `SELECT i.item_name AS "Item", c.category_name AS "Category", i.defective_quantity AS "Defective Quantity", i.quantity_on_hand AS "Good Stock" FROM inventory_items i LEFT JOIN categories c ON i.category_id = c.category_id WHERE i.is_active = true AND COALESCE(i.defective_quantity, 0) > 0`,
    filters: ['category'],
  },
  item_detail: {
    title: 'Item Detail',
    query: `SELECT i.item_name AS "Item", i.serial_number AS "Serial Number", c.category_name AS "Category", d.division_name AS "Division", i.quantity_on_hand AS "Quantity", i.unit_of_measure AS "Unit", i.unit_cost AS "Unit Cost", i.created_at AS "Added" FROM inventory_items i LEFT JOIN categories c ON i.category_id = c.category_id LEFT JOIN divisions d ON i.division_id = d.division_id WHERE i.is_active = true`,
    filters: ['division', 'category'],
  },
  transactions: {
    title: 'Transaction Log',
    query: `SELECT bt.borrow_id AS "ID", i.item_name AS "Item", u.full_name AS "Borrower", d.division_name AS "Division", bt.quantity_borrowed AS "Quantity", bt.borrow_date AS "Borrow Date", bt.expected_return_date AS "Expected Return", bt.actual_return_date AS "Actual Return", bt.status AS "Status" FROM borrow_transactions bt JOIN inventory_items i ON bt.item_id = i.item_id LEFT JOIN users u ON bt.user_id = u.user_id LEFT JOIN divisions d ON bt.division_id = d.division_id WHERE 1=1`,
    filters: ['date', 'division', 'status'],
  },
  returns: {
    title: 'Returns Report',
    query: `SELECT rt.return_id AS "ID", i.item_name AS "Item", u.full_name AS "Processed By", rt.quantity_returned AS "Quantity Returned", rt.condition_returned AS "Condition", rt.return_date AS "Return Date", rt.notes AS "Notes" FROM return_transactions rt JOIN borrow_transactions bt ON rt.borrow_id = bt.borrow_id JOIN inventory_items i ON bt.item_id = i.item_id LEFT JOIN users u ON rt.processed_by = u.user_id WHERE 1=1`,
    filters: ['date'],
  },
  overdue: {
    title: 'Overdue Items',
    query: `SELECT bt.borrow_id AS "ID", i.item_name AS "Item", u.full_name AS "Borrower", d.division_name AS "Division", bt.quantity_borrowed AS "Quantity", bt.expected_return_date AS "Due Date", CURRENT_DATE - bt.expected_return_date AS "Days Overdue" FROM borrow_transactions bt JOIN inventory_items i ON bt.item_id = i.item_id LEFT JOIN users u ON bt.user_id = u.user_id LEFT JOIN divisions d ON bt.division_id = d.division_id WHERE bt.status = 'Overdue' OR (bt.actual_return_date IS NULL AND bt.expected_return_date < CURRENT_DATE)`,
    filters: ['division'],
  },
  borrowed: {
    title: 'Currently Borrowed',
    query: `SELECT bt.borrow_id AS "ID", i.item_name AS "Item", u.full_name AS "Borrower", d.division_name AS "Division", bt.quantity_borrowed AS "Quantity", bt.borrow_date AS "Borrow Date", bt.expected_return_date AS "Due Date" FROM borrow_transactions bt JOIN inventory_items i ON bt.item_id = i.item_id LEFT JOIN users u ON bt.user_id = u.user_id LEFT JOIN divisions d ON bt.division_id = d.division_id WHERE bt.actual_return_date IS NULL AND bt.status IN ('Borrowed', 'Active', 'Overdue')`,
    filters: ['date', 'division'],
  },
  consumption: {
    title: 'Consumption by Item',
    query: `SELECT i.item_name AS "Item", c.category_name AS "Category", COUNT(bt.borrow_id) AS "Times Borrowed", SUM(bt.quantity_borrowed) AS "Issued", SUM(CASE WHEN bt.status = 'Returned' THEN bt.quantity_borrowed ELSE 0 END) AS "Returned", SUM(bt.quantity_borrowed) - SUM(CASE WHEN bt.status = 'Returned' THEN bt.quantity_borrowed ELSE 0 END) AS "Currently Out" FROM borrow_transactions bt JOIN inventory_items i ON bt.item_id = i.item_id LEFT JOIN categories c ON i.category_id = c.category_id WHERE 1=1`,
    filters: ['date', 'division', 'category'],
    group: ' GROUP BY i.item_name, c.category_name',
    order: ' ORDER BY "Issued" DESC',
  },
  most_used: {
    title: 'Most Used Items',
    query: `SELECT i.item_name AS "Item", c.category_name AS "Category", SUM(bt.quantity_borrowed) AS "Issued", COUNT(bt.borrow_id) AS "Transactions" FROM borrow_transactions bt JOIN inventory_items i ON bt.item_id = i.item_id LEFT JOIN categories c ON i.category_id = c.category_id WHERE 1=1`,
    filters: ['date', 'division', 'category'],
    group: ' GROUP BY i.item_name, c.category_name',
    order: ' ORDER BY "Issued" DESC',
  },
  least_used: {
    title: 'Least Used Items',
    query: `SELECT i.item_name AS "Item", c.category_name AS "Category", COALESCE(SUM(bt.quantity_borrowed), 0) AS "Issued", COUNT(bt.borrow_id) AS "Transactions" FROM inventory_items i LEFT JOIN borrow_transactions bt ON bt.item_id = i.item_id LEFT JOIN categories c ON i.category_id = c.category_id WHERE i.is_active = true`,
    filters: ['division', 'category'],
    group: ' GROUP BY i.item_name, c.category_name',
    order: ' ORDER BY "Issued" ASC',
  },
  monthly_trend: {
    title: 'Monthly Issued vs Returned',
    query: `SELECT TO_CHAR(DATE_TRUNC('month', bt.borrow_date), 'YYYY-MM') AS "Month", SUM(bt.quantity_borrowed) AS "Issued", SUM(CASE WHEN bt.status = 'Returned' THEN bt.quantity_borrowed ELSE 0 END) AS "Returned" FROM borrow_transactions bt WHERE 1=1`,
    filters: ['date', 'division'],
    group: ' GROUP BY DATE_TRUNC(\'month\', bt.borrow_date)',
    order: ' ORDER BY "Month" DESC',
  },
  requisitions: {
    title: 'Requisition Status',
    query: `SELECT r.requisition_id AS "ID", u.full_name AS "Requester", d.division_name AS "Division", i.item_name AS "Item", ri.quantity_requested AS "Quantity", r.status AS "Status", r.requested_date AS "Requested Date", r.approval_date AS "Approval Date", ri.purpose AS "Purpose" FROM requisitions r JOIN users u ON r.user_id = u.user_id LEFT JOIN divisions d ON r.division_id = d.division_id JOIN requisition_items ri ON r.requisition_id = ri.requisition_id JOIN inventory_items i ON ri.item_id = i.item_id WHERE 1=1`,
    filters: ['date', 'division', 'status'],
  },
  requisition_status: {
    title: 'Requisitions by Status',
    query: `SELECT r.status AS "Status", COUNT(DISTINCT r.requisition_id) AS "Requisitions", SUM(ri.quantity_requested) AS "Quantity Requested", SUM(COALESCE(ri.quantity_approved, 0)) AS "Quantity Approved" FROM requisitions r JOIN requisition_items ri ON r.requisition_id = ri.requisition_id WHERE 1=1`,
    filters: ['date', 'division', 'status'],
    group: ' GROUP BY r.status',
  },
  requisition_division: {
    title: 'Requisitions by Division',
    query: `SELECT d.division_name AS "Division", COUNT(DISTINCT r.requisition_id) AS "Requisitions", SUM(ri.quantity_requested) AS "Quantity Requested" FROM requisitions r JOIN requisition_items ri ON r.requisition_id = ri.requisition_id LEFT JOIN divisions d ON r.division_id = d.division_id WHERE 1=1`,
    filters: ['date', 'division'],
    group: ' GROUP BY d.division_name',
  },
  requisition_approval: {
    title: 'Requisition Approval Time',
    query: `SELECT r.status AS "Status", COUNT(*) AS "Requisitions", ROUND(AVG(r.approval_date - r.requested_date), 1) AS "Average Days to Approval" FROM requisitions r WHERE r.approval_date IS NOT NULL`,
    filters: ['date', 'status'],
    group: ' GROUP BY r.status',
  },
  requisition_purpose: {
    title: 'Requisition Purpose Analysis',
    query: `SELECT COALESCE(ri.purpose, 'Unspecified') AS "Purpose", COUNT(DISTINCT r.requisition_id) AS "Requisitions", SUM(ri.quantity_requested) AS "Quantity Requested" FROM requisitions r JOIN requisition_items ri ON r.requisition_id = ri.requisition_id WHERE 1=1`,
    filters: ['date', 'division', 'status'],
    group: ' GROUP BY ri.purpose',
    order: ' ORDER BY "Requisitions" DESC',
  },
  audit: {
    title: 'Audit Trail',
    query: `SELECT a.timestamp AS "Timestamp", u.full_name AS "User", a.action AS "Action", a.table_name AS "Table", a.record_id AS "Record ID", a.old_values AS "Previous Value", a.new_values AS "New Value" FROM audit_log a LEFT JOIN users u ON a.user_id = u.user_id WHERE 1=1`,
    filters: ['date'],
  },
  login_audit: {
    title: 'Login Audit Logs',
    query: `SELECT la.login_time AS "Login Time", la.logout_time AS "Logout Time", u.full_name AS "User", la.username AS "Username", r.role_name AS "Role", la.action AS "Action", la.failure_reason AS "Failure Reason", la.ip_address AS "IP Address" FROM login_audit la LEFT JOIN users u ON la.user_id = u.user_id LEFT JOIN roles r ON u.role_id = r.role_id WHERE 1=1`,
    filters: ['date'],
  },
  forecast: {
    title: 'Demand Forecast',
    query: `SELECT i.item_name AS "Item", d.division_name AS "Division", f.forecast_date AS "Forecast Date", f.sma_value AS "Average Demand", f.days_to_depletion AS "Days to Depletion", f.risk_level AS "Risk Level" FROM forecast_data f JOIN inventory_items i ON f.item_id = i.item_id LEFT JOIN divisions d ON f.division_id = d.division_id WHERE 1=1`,
    filters: ['division'],
  },
  forecast_risk: {
    title: 'Forecast Risk',
    query: `SELECT i.item_name AS "Item", d.division_name AS "Division", f.days_to_depletion AS "Days to Depletion", f.risk_level AS "Risk Level", f.sma_value AS "Average Demand" FROM forecast_data f JOIN inventory_items i ON f.item_id = i.item_id LEFT JOIN divisions d ON f.division_id = d.division_id WHERE 1=1`,
    filters: ['division'],
    order: ' ORDER BY f.days_to_depletion ASC',
  },
  incidents: {
    title: 'Incident Report',
    query: `SELECT ir.incident_id AS "ID", i.item_name AS "Item", c.category_name AS "Category", i.unit_of_measure AS "Unit", ir.incident_type AS "Incident Type", ir.incident_date AS "Incident Date", ir.quantity_affected AS "Quantity", u.full_name AS "Reported By", ir.description AS "Description", ir.investigation_remarks AS "Investigation Remarks", ir.status AS "Status", rv.full_name AS "Reviewed By", ir.reviewed_at AS "Reviewed At" FROM incident_reports ir LEFT JOIN inventory_items i ON ir.item_id = i.item_id LEFT JOIN categories c ON i.category_id = c.category_id JOIN users u ON ir.reported_by = u.user_id LEFT JOIN users rv ON ir.reviewed_by = rv.user_id WHERE 1=1`,
    filters: ['date', 'status'],
  },
};

async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  const { report = 'inventory', from, to, division = 'all', category = 'all', status = 'all', format = 'json', search, action, sort, order } = req.query;
  const definition = REPORTS[report];
  if (!definition) return res.status(400).json({ error: 'Invalid report type.' });

  try {
    if (report === 'forecast' || report === 'forecast_risk') {
      const windowMonths = 3;
      const items = await db.query(
        `SELECT i.item_id, i.item_name, i.unit_of_measure, i.reorder_level,
            c.category_name, i.division_id
         FROM inventory_items i
         LEFT JOIN categories c ON c.category_id = i.category_id
         WHERE i.is_active=true`
      );

      const forecasts = await Promise.all(
        items.rows.map(async item => {
          const sma = await computeSMA(item.item_id, windowMonths);
          return {
            item_id: item.item_id,
            item_name: item.item_name,
            category_name: item.category_name,
            division_id: item.division_id,
            unit_of_measure: item.unit_of_measure,
            reorder_level: item.reorder_level,
            ...sma,
          };
        })
      );

      const divisionMap = {};
      const divResult = await db.query('SELECT division_id, division_name FROM divisions');
      divResult.rows.forEach(d => { divisionMap[d.division_id] = d.division_name; });

      const rows = forecasts.map(f => {
        const stock = Number(f.stock) || 0;
        const reorder = Number(f.reorder_level) || 0;
        let riskLevel = 'Safe';
        if (reorder > 0 && stock <= reorder) riskLevel = 'Critical';
        else if (reorder > 0 && stock <= reorder * 1.5) riskLevel = 'Warning';
        else if (f.severity === 'critical') riskLevel = 'Critical';
        else if (f.severity === 'warning') riskLevel = 'Warning';

        return {
          Item: f.item_name,
          Division: divisionMap[f.division_id] || '—',
          'Forecast Date': new Date().toISOString().slice(0, 10),
          'Average Demand': Number(f.sma).toFixed(1),
          'Days to Depletion': f.daysLeft === 999 ? 'N/A' : f.daysLeft,
          'Risk Level': riskLevel,
        };
      });

      if (report === 'forecast_risk') {
        rows.sort((a, b) => {
          const aVal = a['Days to Depletion'] === 'N/A' ? 9999 : Number(a['Days to Depletion']);
          const bVal = b['Days to Depletion'] === 'N/A' ? 9999 : Number(b['Days to Depletion']);
          return aVal - bVal;
        });
      }

      return res.status(200).json({
        title: definition.title,
        rows: rows.filter(r => division === 'all' || r.Division === divisionMap[division]),
      });
    }

    const params = [];
    let query = definition.query;
    const add = (value) => { params.push(value); return `$${params.length}`; };

    if (definition.filters.includes('date')) {
      const dateColumn = report === 'returns'
        ? 'rt.return_date'
        : report === 'forecast'
          ? 'f.forecast_date'
          : report === 'audit'
            ? 'a.timestamp'
            : report === 'login_audit'
              ? 'la.login_time'
            : report === 'incidents'
              ? 'ir.incident_date'
            : report.startsWith('requisition') || report === 'requisitions'
              ? 'r.requested_date'
              : 'bt.borrow_date';
      if (from) query += ` AND ${dateColumn} >= ${add(from)}`;
      if (to) query += ` AND ${dateColumn} <= ${add(to)}`;
    }
    if (division !== 'all' && definition.filters.includes('division')) {
      const column = report === 'dashboard' || report.startsWith('inventory') || ['inventory', 'lowstock', 'outofstock', 'defective'].includes(report) ? 'i.division_id' : report.startsWith('requisition') || report === 'requisitions' ? 'r.division_id' : report === 'forecast' ? 'f.division_id' : 'bt.division_id';
      query += ` AND ${column} = ${add(division)}`;
    }
    if (category !== 'all' && definition.filters.includes('category')) query += ` AND c.category_id = ${add(category)}`;
    if (status !== 'all' && definition.filters.includes('status')) {
      const statusColumn = report === 'incidents'
        ? 'ir.status'
        : report.startsWith('requisition') || report === 'requisitions'
          ? 'r.status'
          : report === 'inventory'
            ? null
            : 'bt.status';
      if (report === 'inventory') {
        query += ` AND CASE WHEN i.quantity_on_hand = 0 THEN 'Out of Stock' WHEN i.quantity_on_hand <= i.reorder_level THEN 'Low Stock' ELSE 'In Stock' END = ${add(status)}`;
      } else {
        query += ` AND ${statusColumn} = ${add(status)}`;
      }
    }
    query += definition.group || '';

    if (report === 'audit' || report === 'login_audit') {
      if (search) {
        query += report === 'login_audit'
          ? ` AND (u.full_name ILIKE ${add(`%${search}%`)} OR la.username ILIKE ${add(`%${search}%`)} OR la.action ILIKE ${add(`%${search}%`)} OR la.failure_reason ILIKE ${add(`%${search}%`)} OR la.ip_address ILIKE ${add(`%${search}%`)})`
          : ` AND (u.full_name ILIKE ${add(`%${search}%`)} OR a.action ILIKE ${add(`%${search}%`)} OR a.table_name ILIKE ${add(`%${search}%`)} OR CAST(a.record_id AS TEXT) ILIKE ${add(`%${search}%`)})`;
      }
      if (action && action !== 'all') {
        query += ` AND ${report === 'login_audit' ? 'la.action' : 'a.action'} = ${add(action)}`;
      }
      const allowedSorts = report === 'login_audit'
        ? ['login_time', 'action', 'user_id']
        : ['timestamp', 'action', 'table_name', 'user_id'];
      const sortCol = allowedSorts.includes(sort) ? sort : report === 'login_audit' ? 'login_time' : 'timestamp';
      const sortOrder = order && order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
      query += ` ORDER BY ${report === 'login_audit' ? 'la' : 'a'}.${sortCol} ${sortOrder}`;
    } else {
      query += definition.order || ' ORDER BY 1 DESC';
    }
    query += ' LIMIT 500';

    const result = await db.query(query, params);
    if (format === 'pdf') {
      const doc = new PDFDocument({ margin: 40, size: 'A4', layout: 'landscape' });
      const chunks = [];
      doc.on('data', chunk => chunks.push(chunk));
      doc.on('end', () => {
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=SkillSupply_${report}_${new Date().toISOString().slice(0, 10)}.pdf`);
        res.send(Buffer.concat(chunks));
      });
      const columns = result.rows.length > 0 ? Object.keys(result.rows[0]) : [];
      doc.fontSize(18).font('Helvetica-Bold').text(`SkillSupply - ${definition.title}`);
      doc.fontSize(9).font('Helvetica').fillColor('#666').text(`As of: ${new Date().toLocaleDateString('en-PH')}`);
      doc.moveDown();
      const tableWidth = doc.page.width - 80;
      const widths = columns.map(() => tableWidth / Math.max(columns.length, 1));
      const formatValue = (column, value) => {
        if (value === null || value === undefined || value === '') return '—';
        if (/date|timestamp/i.test(column) && !Number.isNaN(Date.parse(value))) {
          return new Date(value).toLocaleDateString('en-PH');
        }
        return String(value);
      };
      const drawRow = (values, bold = false) => {
        const rowValues = values.map((value, index) => formatValue(columns[index], value));
        const heights = rowValues.map((value, index) => doc.heightOfString(value, { width: widths[index] - 5, lineGap: 1 }));
        const rowHeight = Math.max(...heights, 10) + 5;
        if (doc.y + rowHeight > doc.page.height - 65) {
          doc.addPage();
          doc.fontSize(7).font('Helvetica-Bold').fillColor('#222');
          columns.forEach((column, index) => doc.text(column, 40 + widths.slice(0, index).reduce((sum, width) => sum + width, 0), doc.y, { width: widths[index] - 5 }));
          doc.y += 18;
        }
        const y = doc.y;
        doc.fontSize(7).font(bold ? 'Helvetica-Bold' : 'Helvetica').fillColor('#222');
        rowValues.forEach((value, index) => doc.text(value, 40 + widths.slice(0, index).reduce((sum, width) => sum + width, 0), y, { width: widths[index] - 5, lineGap: 1 }));
        doc.y = y + rowHeight;
      };
      drawRow(columns, true);
      result.rows.forEach(row => drawRow(columns.map(column => row[column])));
      doc.fontSize(8).font('Helvetica').fillColor('#888').text(`Date Generated: ${new Date().toLocaleString('en-PH')} | Generated by: ${req.user.full_name || req.user.username} | Records: ${result.rows.length}`, 40, doc.page.height - 40, { align: 'center', width: doc.page.width - 80 });
      doc.end();
      return;
    }
    return res.status(200).json({ title: definition.title, report, rows: result.rows });
  } catch (err) {
    console.error('Dynamic report error:', err);
    return res.status(500).json({ error: 'Failed to generate report.' });
  }
}

export default withAuth(handler, 2);
