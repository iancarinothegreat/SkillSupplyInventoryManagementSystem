import pool from './db.js';

export const NOTIFICATION_TYPES = {
  REQUISITION_CREATED: 'REQUISITION_CREATED',
  REQUISITION_UPDATED: 'REQUISITION_UPDATED',
  REQUISITION_STATUS: 'REQUISITION_STATUS',
  REQUISITION_RELEASED: 'REQUISITION_RELEASED',
  REQUISITION_DELETED: 'REQUISITION_DELETED',
  BORROW_CREATED: 'BORROW_CREATED',
  BORROW_UPDATED: 'BORROW_UPDATED',
  BORROW_STATUS: 'BORROW_STATUS',
  BORROW_DELETED: 'BORROW_DELETED',
  RETURN_REQUESTED: 'RETURN_REQUESTED',
  RETURN_COMPLETED: 'RETURN_COMPLETED',
  PROCUREMENT_CREATED: 'PROCUREMENT_CREATED',
  PROCUREMENT_STATUS: 'PROCUREMENT_STATUS',
  PROCUREMENT_RECEIVED: 'PROCUREMENT_RECEIVED',
  LOW_STOCK: 'LOW_STOCK'
};

export const NOTIFICATION_LINKS = {
  REQUISITION_CREATED: '/requisitions',
  REQUISITION_UPDATED: '/requisitions',
  REQUISITION_STATUS: '/my-requisitions',
  REQUISITION_RELEASED: '/requisitions',
  REQUISITION_DELETED: '/requisitions',
  BORROW_CREATED: '/transactions',
  BORROW_UPDATED: '/borrow',
  BORROW_STATUS: '/transactions',
  BORROW_DELETED: '/borrow',
  RETURN_REQUESTED: '/transactions',
  RETURN_COMPLETED: '/transactions',
  PROCUREMENT_CREATED: '/procurement',
  PROCUREMENT_STATUS: '/procurement',
  PROCUREMENT_RECEIVED: '/inventory',
  LOW_STOCK: '/inventory'
};

const DEFAULT_AUDIENCE = [2, 3];

/**
 * Creates in-app notifications for every active user that matches the target
 * audience. Must be called with the same `client` as the surrounding
 * transaction so notifications commit together with the request they describe.
 *
 * @param {object} client - a pg client inside a transaction (or the pool)
 * @param {object} options
 * @param {string} options.type - one of NOTIFICATION_TYPES
 * @param {string} options.title - short notification heading
 * @param {string} options.message - notification body
 * @param {string} [options.link] - deep link opened when the bell entry is clicked
 * @param {number} [options.referenceId] - id of the related record
 * @param {number[]} [options.roles] - hierarchy levels to notify (default: Supply Officer + Administrator)
 * @param {number[]} [options.includeUserIds] - extra user ids to notify (e.g. the requester)
 * @param {number} [options.excludeUserId] - creator of the event (no self notification)
 */
export async function createNotification(client, {
  type,
  title,
  message,
  link = null,
  referenceId = null,
  roles = DEFAULT_AUDIENCE,
  includeUserIds = [],
  excludeUserId = null
}) {
  if (!title || !message) return;

  const targetClient = client || pool;
  const levels = Array.isArray(roles) && roles.length ? roles : DEFAULT_AUDIENCE;
  const extras = Array.isArray(includeUserIds) ? includeUserIds.filter(Boolean) : [];

  try {
    await targetClient.query(`
      INSERT INTO notifications (user_id, type, title, message, link, reference_id)
      SELECT DISTINCT u.user_id, $1::varchar, $2::varchar, $3::text, $4::varchar, $5::int
      FROM users u
      JOIN roles r ON r.role_id = u.role_id
      WHERE u.is_active = TRUE
        AND (
          r.hierarchy_level = ANY($6::int[])
          OR u.user_id = ANY($7::int[])
        )
        AND ($8::int IS NULL OR u.user_id <> $8::int)
    `, [type, title, message, link, referenceId, levels, extras, excludeUserId]);
  } catch (err) {
    console.error('Notification insert failed:', err.message);
    if (client) throw err;
  }
}

export async function getNotifications(userId, { limit = 30 } = {}) {
  const result = await pool.query(`
    SELECT notification_id, type, title, message, link, reference_id, is_read, created_at
    FROM notifications
    WHERE user_id = $1
    ORDER BY created_at DESC
    LIMIT $2
  `, [userId, Math.min(Number(limit) || 30, 100)]);
  return result.rows;
}

export async function getUnreadCount(userId) {
  const result = await pool.query(
    'SELECT COUNT(*)::int AS count FROM notifications WHERE user_id = $1 AND is_read = FALSE',
    [userId]
  );
  return result.rows[0].count;
}
