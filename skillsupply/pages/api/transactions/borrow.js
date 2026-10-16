import { transaction } from '../../../lib/db.js';
import { withAuth } from '../../../lib/rbac.js';
import { createNotification, NOTIFICATION_TYPES } from '../../../lib/notifications.js';

const DAY_MS = 86400000;
const DEFAULT_BORROW_DAYS = 7;

function utcDateOnly(value) {
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed.getTime();
}

function formatDate(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}

async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { item_id, division_id, quantity_borrowed, borrower_name, expected_return_date, purpose, mr_number } = req.body;

  const quantity = Number(quantity_borrowed);
  if (!item_id || !division_id || !Number.isInteger(quantity) || quantity <= 0)
    return res.status(400).json({ error: 'Missing required fields' });
  if (!borrower_name?.trim())
    return res.status(400).json({ error: 'Borrower name is required' });

  try {
    const txn = await transaction(async (client) => {
      const stock = await client.query(
        `SELECT quantity_on_hand, item_name, unit_of_measure, is_returnable, is_borrowable,
                maximum_borrow_days, requires_mr, per_division_limit
         FROM inventory_items WHERE item_id=$1 FOR UPDATE`,
        [item_id]
      );
      if (!stock.rows[0]) {
        const error = new Error('Item not found');
        error.statusCode = 404;
        throw error;
      }
      const item = stock.rows[0];

      if (item.is_borrowable === false) {
        const error = new Error(`${item.item_name} is classified as not borrowable`);
        error.statusCode = 400;
        throw error;
      }
      if (!item.is_returnable) {
        const error = new Error('This item is not returnable and cannot be borrowed');
        error.statusCode = 400;
        throw error;
      }
      if (item.quantity_on_hand < quantity) {
        const error = new Error('Insufficient stock');
        error.statusCode = 400;
        throw error;
      }

      if (item.per_division_limit != null) {
        const releasedRes = await client.query(`
          SELECT COALESCE(SUM(ri.quantity_issued), 0) AS released
          FROM requisitions r
          JOIN requisition_items ri ON ri.requisition_id = r.requisition_id
          WHERE r.division_id = $1 AND ri.item_id = $2 AND r.status = 'Released'
        `, [division_id, item_id]);
        const borrowRes = await client.query(`
          SELECT COALESCE(SUM(quantity_borrowed), 0) AS active
          FROM borrow_transactions
          WHERE division_id = $1 AND item_id = $2 AND status IN ('Borrowed', 'Active', 'Overdue')
        `, [division_id, item_id]);
        const used = Number(releasedRes.rows[0].released) + Number(borrowRes.rows[0].active);
        if (used + quantity > item.per_division_limit) {
          const error = new Error(`Per-division limit reached for ${item.item_name}: this division has used ${used} of ${item.per_division_limit} allowed. You can borrow at most ${item.per_division_limit - used}.`);
          error.statusCode = 400;
          throw error;
        }
      }

      const maxDays = Number(item.maximum_borrow_days) > 0 ? Number(item.maximum_borrow_days) : null;
      const todayMs = utcDateOnly(new Date().toISOString().slice(0, 10));
      let expectedMs = expected_return_date ? utcDateOnly(expected_return_date) : null;

      if (expected_return_date && expectedMs === null) {
        const error = new Error('Invalid expected return date');
        error.statusCode = 400;
        throw error;
      }
      if (expectedMs !== null && expectedMs < todayMs) {
        const error = new Error('Expected return date cannot be earlier than today');
        error.statusCode = 400;
        throw error;
      }
      if (maxDays) {
        const maxMs = todayMs + maxDays * DAY_MS;
        if (expectedMs === null) {
          expectedMs = maxMs;
        } else if (expectedMs > maxMs) {
          const error = new Error(`Maximum borrowing period for ${item.item_name} is ${maxDays} day(s). Expected return date must be on or before ${formatDate(maxMs)}.`);
          error.statusCode = 400;
          throw error;
        }
      } else if (expectedMs === null) {
        expectedMs = todayMs + DEFAULT_BORROW_DAYS * DAY_MS;
      }

      const expectedReturnDate = formatDate(expectedMs);
      const mrNumberValue = (mr_number || '').toString().trim();
      if (item.requires_mr && !mrNumberValue) {
        const error = new Error('An MR (Memorandum Receipt) number is required for this item');
        error.statusCode = 400;
        throw error;
      }

      const result = await client.query(`
        INSERT INTO borrow_transactions
          (item_id, user_id, division_id, quantity_borrowed, borrower_name, expected_return_date, purpose, status, mr_number, mr_date)
        VALUES ($1,$2,$3,$4,$5,$6,$7,'Pending',$8, CASE WHEN $8::varchar IS NULL THEN NULL ELSE CURRENT_DATE END)
        RETURNING *
      `, [item_id, req.user.user_id, division_id, quantity, borrower_name.trim(), expectedReturnDate, purpose, mrNumberValue || null]);

      const created = result.rows[0];

      await client.query(`
        INSERT INTO audit_log (user_id, username, action, table_name, record_id, old_values, new_values)
        VALUES ($1, $2, 'CREATE', 'borrow_transactions', $3, NULL, $4)
      `, [
        req.user.user_id,
        req.user.username || null,
        String(created.borrow_id),
        JSON.stringify({
          ...created,
          item_name: item.item_name,
          unit_of_measure: item.unit_of_measure,
          maximum_borrow_days: maxDays,
          borrower_name: borrower_name.trim()
        })
      ]);

      await createNotification(client, {
        type: NOTIFICATION_TYPES.BORROW_CREATED,
        title: 'New borrow request',
        message: `${borrower_name.trim()} requested to borrow ${quantity} ${item.unit_of_measure || 'unit(s)'} of ${item.item_name} (return by ${expectedReturnDate}).`,
        link: '/transactions',
        referenceId: created.borrow_id,
        excludeUserId: req.user.user_id
      });

      return created;
    });

    return res.status(201).json(txn);
  } catch (err) {
    console.error(err);
    return res.status(err.statusCode || 500).json({ error: err.message || 'Server error' });
  }
}

export default withAuth(handler, 1);
