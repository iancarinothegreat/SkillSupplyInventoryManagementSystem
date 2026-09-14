import { query } from '../../../lib/db.js';
import { withAuth } from '../../../lib/rbac.js';

async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  try {
    const result = await query(`
      UPDATE inventory_items
      SET is_returnable = false
      WHERE is_active = true
      RETURNING item_id
    `);

    return res.status(200).json({
      message: 'All items have been set to non-returnable.',
      updatedCount: result.rowCount
    });
  } catch (err) {
    console.error('Bulk non-returnable error:', err);
    return res.status(500).json({ error: 'Failed to update items.' });
  }
}

export default withAuth(handler, 3);
