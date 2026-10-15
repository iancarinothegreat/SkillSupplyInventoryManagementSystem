import { query } from '../../../lib/db.js';
import { withAuth } from '../../../lib/rbac.js';

async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const result = await query(`
      SELECT d.division_name,
        COALESCE(SUM(CASE WHEN r.status = 'Pending' THEN 1 ELSE 0 END), 0) AS pending,
        COALESCE(SUM(CASE WHEN r.status = 'Approved' THEN 1 ELSE 0 END), 0) AS approved,
        COALESCE(SUM(CASE WHEN r.status = 'Released' THEN 1 ELSE 0 END), 0) AS released,
        COALESCE(SUM(CASE WHEN r.status = 'Rejected' THEN 1 ELSE 0 END), 0) AS rejected,
        COALESCE(COUNT(r.requisition_id), 0) AS total
      FROM divisions d
      LEFT JOIN requisitions r ON r.division_id = d.division_id
      GROUP BY d.division_name
      ORDER BY d.division_name
    `);
    const data = result.rows.map(row => ({
      division: row.division_name,
      pending: parseInt(row.pending, 10),
      approved: parseInt(row.approved, 10),
      released: parseInt(row.released, 10),
      rejected: parseInt(row.rejected, 10),
      total: parseInt(row.total, 10)
    }));
    return res.status(200).json(data);
  } catch (err) {
    console.error('Requisitions API error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}

export default withAuth(handler, 1);
