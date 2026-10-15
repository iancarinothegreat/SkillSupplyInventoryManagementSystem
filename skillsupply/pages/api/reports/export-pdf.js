import { verifyToken, getTokenFromRequest } from '../../../lib/auth';
import { checkRole } from '../../../lib/rbac';
import db from '../../../lib/db';
import PDFDocument from 'pdfkit';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  const token = getTokenFromRequest(req);
  const user = token ? verifyToken(token) : null;
  if (!user) {
    return res.status(401).json({ message: 'Unauthorized', tokenPresent: !!token });
  }
  if (!checkRole(user, 2)) {
    return res.status(403).json({ message: 'Forbidden', roleLevel: user?.hierarchy_level });
  }

  const { report = 'inventory', from, to } = req.query;

  try {
    const doc = new PDFDocument({ margin: 50 });
    const chunks = [];

    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => {
      const pdfBuffer = Buffer.concat(chunks);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename=SkillSupply_${report}_${new Date().toISOString().slice(0, 10)}.pdf`
      );
      res.send(pdfBuffer);
    });

    // Header
    doc.fontSize(20).font('Helvetica-Bold').text('SkillSupply', 50, 50);
    doc.fontSize(10)
      .font('Helvetica')
      .fillColor('#555')
      .text('Mandaluyong Manpower Technical-Vocational Training Center (MMTVTC)', 50, 75);
    doc.fontSize(12)
      .fillColor('#000')
      .font('Helvetica-Bold')
      .text(getReportTitle(report), 50, 100);
    doc.fontSize(9)
      .font('Helvetica')
      .fillColor('#888')
      .text(`Generated: ${new Date().toLocaleString('en-PH')} | By: ${user.username}`, 50, 118);

    // Date range note
    if (from || to) {
      doc.text(`Period: ${from || 'start'} to ${to || 'present'}`, 50, 132);
    }

    doc.moveTo(50, 150).lineTo(545, 150).strokeColor('#e5e7eb').stroke();
    doc.moveDown(2);

    if (report === 'inventory') {
      await generateInventoryReport(doc, db);
    } else if (report === 'transactions') {
      await generateTransactionReport(doc, db, from, to);
    } else if (report === 'lowstock') {
      await generateLowStockReport(doc, db);
    } else if (report === 'consumption') {
      await generateConsumptionReport(doc, db, from, to);
    }

    // Footer
    const pageHeight = doc.page.height;
    doc.fontSize(8)
      .fillColor('#aaa')
      .text(
        'SkillSupply — MMTVTC Supply Management Information System',
        50,
        pageHeight - 50,
        { align: 'center' }
      );

    doc.end();
  } catch (err) {
    console.error('PDF export error:', err);
    res.status(500).json({ message: 'Failed to generate PDF.' });
  }
}

function getReportTitle(report) {
  const titles = {
    inventory: 'Inventory Status Report',
    transactions: 'Transaction Log Report',
    lowstock: 'Low Stock Alert Report',
    consumption: 'Consumption Report',
  };
  return titles[report] || 'Supply Report';
}

async function generateInventoryReport(doc, db) {
  const { rows } = await db.query(`
    SELECT i.item_id AS id, i.item_name AS name, c.category_name AS category,
           i.quantity_on_hand AS quantity, i.unit_of_measure AS unit, i.reorder_level AS reorder_point
    FROM inventory_items i
    LEFT JOIN categories c ON i.category_id = c.category_id
    ORDER BY c.category_name, i.item_name
  `);

  doc.fontSize(11).font('Helvetica-Bold').fillColor('#000').text('Inventory Summary', { underline: true });
  doc.moveDown(0.5);
  doc.fontSize(9).font('Helvetica').fillColor('#555').text(`Total items: ${rows.length}`);
  doc.text(`Out of stock: ${rows.filter((r) => r.quantity === 0).length}`);
  doc.text(
    `Low stock: ${rows.filter((r) => r.quantity > 0 && r.quantity <= r.reorder_point).length}`
  );
  doc.moveDown(1);

  const cols = [50, 200, 300, 370, 430, 490];
  const headers = ['Item Name', 'Category', 'Stock', 'Unit', 'Reorder Pt', 'Status'];
  doc.fontSize(8).font('Helvetica-Bold').fillColor('#374151');
  headers.forEach((h, i) =>
    doc.text(h, cols[i], doc.y, { width: cols[i + 1] ? cols[i + 1] - cols[i] - 5 : 100 })
  );
  doc.moveDown(0.3);
  doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#e5e7eb').stroke();
  doc.moveDown(0.3);

  rows.forEach((row, idx) => {
    if (doc.y > doc.page.height - 80) {
      doc.addPage();
      doc.moveDown(1);
    }
    const y = doc.y;
    const status = row.quantity <= row.reorder_point ? 'Critical' : row.quantity <= row.reorder_point * 1.5 ? 'Low Stock' : 'In Stock';
    doc.fontSize(8).font('Helvetica').fillColor(idx % 2 === 0 ? '#000' : '#333');
    doc.text(row.name, cols[0], y, { width: 145 });
    doc.text(row.category || '—', cols[1], y, { width: 95 });
    doc.text(String(row.quantity), cols[2], y, { width: 65 });
    doc.text(row.unit || '—', cols[3], y, { width: 55 });
    doc.text(String(row.reorder_point || 0), cols[4], y, { width: 55 });
    doc
      .fillColor(
        row.quantity === 0
          ? '#dc2626'
          : row.quantity <= row.reorder_point
          ? '#d97706'
          : '#16a34a'
      )
      .text(status, cols[5], y, { width: 70 });
    doc.moveDown(0.5);
  });
}

async function generateTransactionReport(doc, db, from, to) {
  let query = `
    SELECT bt.borrow_id AS id, i.item_name, bt.borrower_name, d.division_name AS borrower_division,
           bt.quantity_borrowed AS quantity, bt.borrow_date, bt.expected_return_date, bt.status
    FROM borrow_transactions bt
    LEFT JOIN inventory_items i ON bt.item_id = i.item_id
    LEFT JOIN divisions d ON bt.division_id = d.division_id
    WHERE 1=1
  `;
  const params = [];
  if (from) {
    params.push(from);
    query += ` AND bt.borrow_date >= $${params.length}`;
  }
  if (to) {
    params.push(to);
    query += ` AND bt.borrow_date <= $${params.length}`;
  }
  query += ' ORDER BY bt.borrow_date DESC LIMIT 200';

  const { rows } = await db.query(query, params);

  doc.fontSize(11).font('Helvetica-Bold').fillColor('#000').text('Transaction Log', { underline: true });
  doc.moveDown(0.5);
  doc.fontSize(9).font('Helvetica').fillColor('#555').text(`Total records: ${rows.length}`);
  doc.moveDown(1);

  const cols = [50, 110, 220, 310, 360, 420, 490];
  const headers = ['ID', 'Item', 'Borrower', 'Division', 'Qty', 'Borrow Date', 'Status'];
  doc.fontSize(8).font('Helvetica-Bold').fillColor('#374151');
  headers.forEach((h, i) =>
    doc.text(h, cols[i], doc.y, { width: cols[i + 1] ? cols[i + 1] - cols[i] - 5 : 80 })
  );
  doc.moveDown(0.3);
  doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#e5e7eb').stroke();
  doc.moveDown(0.3);

  rows.forEach((row) => {
    if (doc.y > doc.page.height - 80) {
      doc.addPage();
      doc.moveDown(1);
    }
    const y = doc.y;
    doc.fontSize(8).font('Helvetica').fillColor('#000');
    doc.text(`#${row.id}`, cols[0], y, { width: 55 });
    doc.text(row.item_name || '—', cols[1], y, { width: 105 });
    doc.text(row.borrower_name || '—', cols[2], y, { width: 85 });
    doc.text(row.borrower_division || '—', cols[3], y, { width: 45 });
    doc.text(String(row.quantity), cols[4], y, { width: 35 });
    doc.text(new Date(row.borrow_date).toLocaleDateString(), cols[5], y, { width: 65 });
    doc
      .fillColor(
        row.status === 'Returned'
          ? '#16a34a'
          : row.status === 'Overdue'
          ? '#dc2626'
          : '#d97706'
      )
      .text(row.status, cols[6], y, { width: 60 });
    doc.moveDown(0.5);
  });
}

async function generateLowStockReport(doc, db) {
  const { rows } = await db.query(`
    SELECT i.item_id AS id, i.item_name AS name, c.category_name AS category,
           i.quantity_on_hand AS quantity, i.reorder_level AS reorder_point, i.unit_of_measure AS unit
    FROM inventory_items i
    LEFT JOIN categories c ON i.category_id = c.category_id
    WHERE i.quantity_on_hand <= i.reorder_level
    ORDER BY i.quantity_on_hand ASC
  `);

  doc.fontSize(11).font('Helvetica-Bold').fillColor('#dc2626').text('⚠ Low Stock Alert', { underline: true });
  doc.moveDown(0.5);
  doc.fontSize(9).font('Helvetica').fillColor('#555').text(`${rows.length} item(s) need restocking`);
  doc.moveDown(1);

  if (rows.length === 0) {
    doc.fontSize(10).fillColor('#16a34a').text('All items are sufficiently stocked. No action needed.');
    return;
  }

  const cols = [50, 200, 295, 360, 420, 490];
  const headers = ['Item Name', 'Category', 'Stock', 'Reorder Pt', 'Deficit', 'Status'];
  doc.fontSize(8).font('Helvetica-Bold').fillColor('#374151');
  headers.forEach((h, i) =>
    doc.text(h, cols[i], doc.y, { width: cols[i + 1] ? cols[i + 1] - cols[i] - 5 : 80 })
  );
  doc.moveDown(0.3);
  doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#e5e7eb').stroke();
  doc.moveDown(0.3);

  rows.forEach((row) => {
    if (doc.y > doc.page.height - 80) {
      doc.addPage();
      doc.moveDown(1);
    }
    const y = doc.y;
    const deficit = Math.max(0, row.reorder_point - row.quantity);
    doc.fontSize(8).font('Helvetica').fillColor('#000');
    doc.text(row.name, cols[0], y, { width: 145 });
    doc.text(row.category || '—', cols[1], y, { width: 90 });
    doc.fillColor('#dc2626').text(String(row.quantity), cols[2], y, { width: 60 });
    doc.fillColor('#000').text(String(row.reorder_point), cols[3], y, { width: 55 });
    doc.fillColor('#d97706').text(String(deficit), cols[4], y, { width: 65 });
    doc
      .fillColor(row.quantity === 0 ? '#dc2626' : '#d97706')
      .text(row.quantity <= row.reorder_point ? 'Critical' : 'Reorder', cols[5], y, { width: 60 });
    doc.moveDown(0.5);
  });
}

async function generateConsumptionReport(doc, db, from, to) {
  let query = `
    SELECT i.item_name AS item_name, COUNT(*) AS times_borrowed,
           SUM(bt.quantity_borrowed) AS total_borrowed,
           SUM(CASE WHEN bt.status = 'Returned' THEN bt.quantity_borrowed ELSE 0 END) AS total_returned
    FROM borrow_transactions bt
    LEFT JOIN inventory_items i ON bt.item_id = i.item_id
    WHERE 1=1
  `;
  const params = [];
  if (from) {
    params.push(from);
    query += ` AND bt.borrow_date >= $${params.length}`;
  }
  if (to) {
    params.push(to);
    query += ` AND bt.borrow_date <= $${params.length}`;
  }
  query += ' GROUP BY i.item_name ORDER BY total_borrowed DESC';

  const { rows } = await db.query(query, params);

  doc.fontSize(11).font('Helvetica-Bold').fillColor('#000').text('Consumption Report', { underline: true });
  doc.moveDown(0.5);
  doc.fontSize(9).font('Helvetica').fillColor('#555').text(`${rows.length} items analyzed`);
  doc.moveDown(1);

  const cols = [50, 220, 305, 380, 455];
  const headers = ['Item', 'Times Borrowed', 'Total Borrowed', 'Total Returned', 'Currently Out'];
  doc.fontSize(8).font('Helvetica-Bold').fillColor('#374151');
  headers.forEach((h, i) =>
    doc.text(h, cols[i], doc.y, { width: cols[i + 1] ? cols[i + 1] - cols[i] - 5 : 80 })
  );
  doc.moveDown(0.3);
  doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#e5e7eb').stroke();
  doc.moveDown(0.3);

  rows.forEach((row) => {
    if (doc.y > doc.page.height - 80) {
      doc.addPage();
      doc.moveDown(1);
    }
    const y = doc.y;
    const out = (parseInt(row.total_borrowed) || 0) - (parseInt(row.total_returned) || 0);
    doc.fontSize(8).font('Helvetica').fillColor('#000');
    doc.text(row.item_name || '—', cols[0], y, { width: 165 });
    doc.text(String(row.times_borrowed), cols[1], y, { width: 80 });
    doc.fillColor('#2563eb').text(String(row.total_borrowed), cols[2], y, { width: 70 });
    doc.fillColor('#16a34a').text(String(row.total_returned), cols[3], y, { width: 70 });
    doc.fillColor(out > 0 ? '#d97706' : '#6b7280').text(String(out), cols[4], y, { width: 60 });
    doc.moveDown(0.5);
  });
}

