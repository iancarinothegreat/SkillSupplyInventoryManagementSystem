import { query } from '../../../lib/db.js';
import { getTokenFromRequest, verifyToken } from '../../../lib/auth.js';

async function handler(req, res) {
  const token = getTokenFromRequest(req);
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  const decoded = verifyToken(token);
  if (!decoded || decoded.hierarchy_level < 2) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const { action } = req.body;

  if (action === 'set_non_returnable') {
    try {
      const result = await query(`
        UPDATE inventory_items
        SET is_returnable = false
        WHERE is_active = true
        RETURNING item_id
      `);
      try {
        await query(`
          INSERT INTO audit_log (user_id, action_type, affected_table, new_value)
          VALUES ($1,'BULK_UPDATE','inventory_items',$2)
        `, [decoded.user_id, JSON.stringify({ action: 'set_non_returnable', count: result.rowCount })]);
      } catch {}

      return res.status(200).json({ success: true, updated: result.rowCount });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: 'Server error' });
    }
  }

  if (action === 'delete_all') {
    try {
      const result = await query(`
        UPDATE inventory_items
        SET is_active = false
        WHERE is_active = true
        RETURNING item_id
      `);
      try {
        await query(`
          INSERT INTO audit_log (user_id, action_type, affected_table, new_value)
          VALUES ($1,'BULK_DELETE','inventory_items',$2)
        `, [decoded.user_id, JSON.stringify({ action: 'delete_all', count: result.rowCount })]);
      } catch {}

      return res.status(200).json({ success: true, deleted: result.rowCount });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: 'Server error' });
    }
  }

  return res.status(400).json({ error: 'Invalid action' });
}

export default handler;
