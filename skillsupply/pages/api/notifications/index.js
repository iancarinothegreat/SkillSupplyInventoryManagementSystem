import { query } from '../../../lib/db.js';
import { withAuth } from '../../../lib/rbac.js';
import { NOTIFICATION_LINKS } from '../../../lib/notifications.js';

async function handler(req, res) {
  const user = req.user;

  if (req.method === 'GET') {
    try {
      const limit = Math.min(Number(req.query.limit) || 30, 100);
      const rows = await query(`
        SELECT notification_id, type, title, message, link, reference_id, is_read, created_at
        FROM notifications
        WHERE user_id = $1
        ORDER BY created_at DESC
        LIMIT $2
      `, [user.user_id, limit]);

      const unread = await query(
        'SELECT COUNT(*)::int AS count FROM notifications WHERE user_id = $1 AND is_read = FALSE',
        [user.user_id]
      );

      return res.status(200).json({
        notifications: rows.rows.map((row) => ({
          ...row,
          link: row.link || NOTIFICATION_LINKS[row.type] || null
        })),
        unread_count: unread.rows[0].count
      });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: 'Server error' });
    }
  }

  if (req.method === 'PUT') {
    try {
      const { notification_id, all } = req.body || {};

      if (all === true) {
        await query(
          'UPDATE notifications SET is_read = TRUE WHERE user_id = $1 AND is_read = FALSE',
          [user.user_id]
        );
        return res.status(200).json({ message: 'All notifications marked as read' });
      }

      if (!notification_id) {
        return res.status(400).json({ error: 'notification_id is required' });
      }

      const result = await query(
        'UPDATE notifications SET is_read = TRUE WHERE notification_id = $1 AND user_id = $2',
        [notification_id, user.user_id]
      );

      if (!result.rowCount) return res.status(404).json({ error: 'Notification not found' });
      return res.status(200).json({ message: 'Notification marked as read' });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: 'Server error' });
    }
  }

  if (req.method === 'DELETE') {
    try {
      await query('DELETE FROM notifications WHERE user_id = $1', [user.user_id]);
      return res.status(200).json({ message: 'Notifications cleared' });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: 'Server error' });
    }
  }

  return res.status(405).end();
}

export default withAuth(handler, 1);
