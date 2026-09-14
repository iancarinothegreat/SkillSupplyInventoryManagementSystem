import { query } from '../../../lib/db.js';
import { withAuth } from '../../../lib/rbac.js';

async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  const search = String(req.query.search || '').trim();
  try {
    const result = await query(`
      SELECT MIN(i.item_id) AS catalog_id, i.item_name, MAX(i.description) AS description,
             i.category_id, i.unit_of_measure AS default_unit, MAX(i.reorder_level) AS default_reorder_level
      FROM inventory_items i
      WHERE i.is_active = true
        AND ($1 = '' OR i.item_name ILIKE $2 OR COALESCE(i.description, '') ILIKE $2)
      GROUP BY i.item_name, i.category_id, i.unit_of_measure
      ORDER BY i.item_name
      LIMIT 10
    `, [search, `%${search}%`]);
    return res.status(200).json(result.rows);
  } catch (err) {
    console.error('Item catalog error:', err);
    return res.status(500).json({ error: 'Failed to load item suggestions.' });
  }
}

export default withAuth(handler, 1);
