import { query } from '../../../lib/db.js';
import { withAuth } from '../../../lib/rbac.js';

async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { confirm } = req.body || {};
  if (confirm !== 'DELETE ALL DATA') {
    return res.status(400).json({ error: 'Confirmation text does not match. Type "DELETE ALL DATA" to confirm.' });
  }

  try {
    await query(`
      TRUNCATE TABLE
        return_transactions,
        requisition_items,
        consumption_tracking,
        forecast_data,
        borrow_transactions,
        requisitions,
        inventory_items
      RESTART IDENTITY CASCADE
    `);

    return res.status(200).json({ message: 'All inventory items have been deleted successfully.' });
  } catch (err) {
    console.error('Purge error:', err);
    return res.status(500).json({ error: 'Failed to delete all inventory items.' });
  }
}

export default withAuth(handler, 3);
