import { withAuth } from '../../../lib/rbac';
import db from '../../../lib/db';

const INCIDENT_TYPES = ['Theft', 'Loss', 'Damage', 'Missing Parts', 'Expired'];
const INCIDENT_STATUSES = ['Open', 'Investigating', 'Resolved', 'Closed'];

async function handler(req, res) {
  if (req.method === 'GET') {
    try {
      const userFilter = req.user.hierarchy_level < 2 ? 'WHERE ir.reported_by = $1' : '';
      const params = req.user.hierarchy_level < 2 ? [req.user.user_id] : [];
      const result = await db.query(`
        SELECT ir.incident_id, ir.item_id, i.item_name, i.unit_of_measure,
               ir.incident_type, ir.incident_date, ir.quantity_affected,
               ir.description, ir.investigation_remarks, ir.status,
               u.full_name AS reported_by_name,
               rv.user_id AS reviewed_by, rv.full_name AS reviewed_by_name, ir.reviewed_at
        FROM incident_reports ir
        LEFT JOIN inventory_items i ON ir.item_id = i.item_id
        JOIN users u ON ir.reported_by = u.user_id
        LEFT JOIN users rv ON ir.reviewed_by = rv.user_id
        ${userFilter}
        ORDER BY ir.incident_date DESC, ir.created_at DESC
        LIMIT 500
      `, params);
      return res.status(200).json(result.rows);
    } catch (err) {
      console.error('Incident list error:', err);
      return res.status(500).json({ error: 'Failed to load incident reports.' });
    }
  }

  if (req.method === 'POST') {
    const {
      item_id, incident_type, incident_date, quantity_affected,
      description, investigation_remarks, status,
    } = req.body;
    const quantity = Number(quantity_affected || 1);

    if (!INCIDENT_TYPES.includes(incident_type)) return res.status(400).json({ error: 'Invalid incident type.' });
    if (!description?.trim()) return res.status(400).json({ error: 'Incident description is required.' });
    if (!Number.isInteger(quantity) || quantity < 1) return res.status(400).json({ error: 'Quantity affected must be a positive whole number.' });
    try {
      const result = await db.query(`
        INSERT INTO incident_reports
          (item_id, incident_type, incident_date, reported_by, quantity_affected, description, investigation_remarks, status)
        VALUES ($1, $2, COALESCE($3, CURRENT_DATE), $4, $5, $6, $7, $8)
        RETURNING *
      `, [item_id || null, incident_type, incident_date || null, req.user.user_id, quantity, description.trim(), req.user.hierarchy_level >= 2 ? investigation_remarks?.trim() || null : null, req.user.hierarchy_level >= 2 && status && INCIDENT_STATUSES.includes(status) ? status : 'Open']);

      await db.query(`
        INSERT INTO audit_log (user_id, action, table_name, record_id, new_values)
        VALUES ($1,'CREATE','incident_reports',$2,$3)
      `, [req.user.user_id, result.rows[0].incident_id, JSON.stringify(result.rows[0])]);

      return res.status(201).json(result.rows[0]);
    } catch (err) {
      console.error('Incident create error:', err);
      return res.status(500).json({ error: 'Failed to save incident report.' });
    }
  }

  if (req.method === 'PUT') {
    if (req.user.hierarchy_level < 2) return res.status(403).json({ error: 'Forbidden' });
    const { incident_id, status, investigation_remarks } = req.body || {};
    if (!incident_id || !INCIDENT_STATUSES.includes(status)) return res.status(400).json({ error: 'Valid incident ID and status are required.' });

    try {
      const existing = await db.query('SELECT * FROM incident_reports WHERE incident_id=$1', [incident_id]);
      const previous = existing.rows[0] || null;

      const result = await db.query(`
        UPDATE incident_reports
        SET status = $1, investigation_remarks = $2, reviewed_by = $3, reviewed_at = NOW()
        WHERE incident_id = $4
        RETURNING *
      `, [status, investigation_remarks?.trim() || null, req.user.user_id, incident_id]);
      if (result.rows.length === 0) return res.status(404).json({ error: 'Incident not found.' });

      await db.query(`
        INSERT INTO audit_log (user_id, action, table_name, record_id, old_values, new_values)
        VALUES ($1,'UPDATE','incident_reports',$2,$3,$4)
      `, [req.user.user_id, incident_id, previous ? JSON.stringify({ status: previous.status }) : null, JSON.stringify(result.rows[0])]);

      return res.status(200).json(result.rows[0]);
    } catch (err) {
      console.error('Incident update error:', err);
      return res.status(500).json({ error: 'Failed to update incident report.' });
    }
  }

  return res.status(405).end();
}

export default withAuth(handler, 1);
