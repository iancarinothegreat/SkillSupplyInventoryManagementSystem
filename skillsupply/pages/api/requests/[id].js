import { query } from '../../../lib/db.js';
import { withAuth } from '../../../lib/rbac.js';

async function handler(req, res) {
  const { id } = req.query;

  if (req.method === 'PUT') {
    const { status, remarks } = req.body;
    if (!['Approved', 'Rejected'].includes(status))
      return res.status(400).json({ error: 'Invalid status' });

    try {
      const result = await query(`
        UPDATE requisitions
        SET status=$1, approved_by=$2, approval_date=NOW(), approval_remarks=$3
        WHERE requisition_id=$4
        RETURNING *
      `, [status, req.user.user_id, remarks || null, id]);
      return res.status(200).json(result.rows[0]);
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: 'Server error' });
    }
  }

  return res.status(405).end();
}

export default withAuth(handler, 2);