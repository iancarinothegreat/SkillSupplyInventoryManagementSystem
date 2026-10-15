import pool from '../../../lib/db.js';
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

async function handleStatusChange(req, res, id) {
  const { status, remarks, mr_number } = req.body;
  const validStatuses = ['Borrowed', 'Overdue', 'Returned', 'Cancelled'];

  if (req.user.hierarchy_level < 2) {
    return res.status(403).json({ error: 'Only supply officers and administrators can change transaction status' });
  }

  if (!status || !validStatuses.includes(status))
    return res.status(400).json({ error: 'Valid status is required: Borrowed, Overdue, Returned, Cancelled' });

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const existing = await client.query(
      'SELECT * FROM borrow_transactions WHERE borrow_id=$1',
      [id]
    );
    if (existing.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Transaction not found' });
    }

    const current = existing.rows[0];

    if (current.status === 'Returned') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Cannot modify a returned transaction' });
    }

    if (current.status === 'Cancelled') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Cannot modify a cancelled transaction' });
    }

    if (status === 'Overdue') {
      if (!['Borrowed', 'Active', 'Issued'].includes(current.status)) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Only an approved borrowed transaction can become Overdue' });
      }
      const overdueCheck = await client.query(
        `SELECT expected_return_date < CURRENT_DATE AS is_overdue
         FROM borrow_transactions
         WHERE borrow_id = $1`,
        [id]
      );
      if (!overdueCheck.rows[0]?.is_overdue) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'A transaction can only be marked Overdue after its expected return date has passed.' });
      }
    }

    if (status === 'Returned' && current.status === 'Returned') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Transaction is already returned' });
    }

    if (status === 'Returned' && !['Borrowed', 'Overdue'].includes(current.status)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'A pending transaction must be approved as Borrowed before it can be returned' });
    }

    if (status === 'Borrowed' && !['Pending', 'Overdue'].includes(current.status)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Only pending or overdue transactions can be set to Borrowed' });
    }

    const itemDetails = await client.query(
      'SELECT item_name, unit_of_measure, requires_mr, maximum_borrow_days, is_borrowable FROM inventory_items WHERE item_id=$1',
      [current.item_id]
    );
    const item = itemDetails.rows[0] || {};
    const mrNumberValue = (mr_number || '').toString().trim() || current.mr_number || null;

    if (status === 'Borrowed' && item.requires_mr && !mrNumberValue) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'An MR (Memorandum Receipt) number is required for this item' });
    }

    if (status === 'Borrowed' && current.status === 'Pending') {
      if (item.is_borrowable === false) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: `${item.item_name} is classified as not borrowable` });
      }
      const stock = await client.query(
        'SELECT quantity_on_hand FROM inventory_items WHERE item_id=$1 FOR UPDATE',
        [current.item_id]
      );
      if (!stock.rows[0] || stock.rows[0].quantity_on_hand < current.quantity_borrowed) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Insufficient stock to approve this borrow' });
      }

      const maxDays = Number(item.maximum_borrow_days) > 0 ? Number(item.maximum_borrow_days) : null;
      if (maxDays && current.expected_return_date) {
        const todayMs = utcDateOnly(new Date().toISOString().slice(0, 10));
        const expectedMs = utcDateOnly(current.expected_return_date);
        if (expectedMs !== null && expectedMs > todayMs + maxDays * DAY_MS) {
          await client.query('ROLLBACK');
          return res.status(400).json({ error: `Expected return date exceeds the maximum borrowing period of ${maxDays} day(s) for ${item.item_name}.` });
        }
      }

      await client.query(
        'UPDATE inventory_items SET quantity_on_hand = quantity_on_hand - $1 WHERE item_id=$2',
        [current.quantity_borrowed, current.item_id]
      );
      const consumption = await client.query(
        `UPDATE consumption_tracking
         SET quantity_consumed = quantity_consumed + $3::int
         WHERE item_id = $1::int AND division_id = $2::int AND consumption_date = CURRENT_DATE`,
        [current.item_id, current.division_id, current.quantity_borrowed]
      );
      if (consumption.rowCount === 0) {
        await client.query(
          `INSERT INTO consumption_tracking
            (item_id, division_id, quantity_consumed, consumption_date)
           VALUES ($1::int, $2::int, $3::int, CURRENT_DATE)`,
          [current.item_id, current.division_id, current.quantity_borrowed]
        );
      }
    }

    if (status === 'Returned') {
      await client.query(
        'INSERT INTO return_transactions (borrow_id, quantity_returned, condition_returned, processed_by, notes) VALUES ($1,$2,$3,$4,$5)',
        [id, current.quantity_borrowed, 'Good', req.user.user_id, remarks || '']
      );
      await client.query(
        'UPDATE inventory_items SET quantity_on_hand = quantity_on_hand + $1 WHERE item_id=$2',
        [current.quantity_borrowed, current.item_id]
      );
      if (current.requisition_id) {
        await client.query(
          `UPDATE requisitions SET status='Returned'
           WHERE requisition_id=$1`,
          [current.requisition_id]
        );
      }
    }

    await client.query(
      `UPDATE borrow_transactions
       SET status=$1::varchar,
           mr_number = CASE WHEN $2::varchar IS NULL THEN mr_number ELSE $2::varchar END,
           mr_date = CASE WHEN $2::varchar IS NULL THEN mr_date ELSE CURRENT_DATE END,
           actual_return_date=CASE WHEN $3::varchar='Returned' THEN CURRENT_DATE ELSE actual_return_date END
       WHERE borrow_id=$4::int`,
      [status, mrNumberValue, status, id]
    );

    const updated = await client.query(
      `SELECT bt.*, i.item_name, i.unit_of_measure
       FROM borrow_transactions bt
       JOIN inventory_items i ON i.item_id = bt.item_id
       WHERE bt.borrow_id=$1`,
      [id]
    );

    await client.query(
      'INSERT INTO audit_log (user_id, username, action, table_name, record_id, old_values, new_values) VALUES ($1,$2,$3,$4,$5,$6)',
      [
        req.user.user_id,
        req.user.username || null,
        'UPDATE_STATUS',
        'borrow_transactions',
        String(id),
        JSON.stringify({ status: current.status, quantity_borrowed: current.quantity_borrowed, expected_return_date: current.expected_return_date }),
        JSON.stringify({ ...updated.rows[0], previous_status: current.status, changed_by: req.user.full_name || req.user.username || null, remarks: remarks || null })
      ]
    );

    await createNotification(client, {
      type: NOTIFICATION_TYPES.BORROW_STATUS,
      title: `Borrow request ${status.toLowerCase()}`,
      message: `${req.user.full_name || req.user.username} marked borrow request #${id} as ${status} — ${current.quantity_borrowed} ${item.unit_of_measure || 'unit(s)'} of ${item.item_name || 'item'}${remarks ? `. Remarks: ${remarks}` : ''}`,
      link: '/transactions',
      referenceId: id,
      includeUserIds: current.user_id ? [current.user_id] : [],
      excludeUserId: req.user.user_id
    });

    await client.query('COMMIT');

    return res.status(200).json(updated.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error(err);
    return res.status(err.statusCode || 500).json({ error: err.message || 'Server error' });
  } finally {
    client.release();
  }
}

async function handleFieldEdit(req, res, id) {
  const { item_id, quantity_borrowed, expected_return_date, purpose, borrower_name, division_id, mr_number } = req.body || {};
  const parsedQuantity = Number(quantity_borrowed);

  if (!item_id || !division_id || !Number.isInteger(parsedQuantity) || parsedQuantity < 1 || !borrower_name?.trim()) {
    return res.status(400).json({ error: 'Item, quantity, borrower name, and division are required' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const existing = await client.query(
      'SELECT * FROM borrow_transactions WHERE borrow_id=$1 FOR UPDATE',
      [id]
    );
    const current = existing.rows[0];
    if (!current) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Transaction not found' });
    }
    if (current.user_id !== req.user.user_id) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'You can only edit your own borrow requests' });
    }
    if (current.status !== 'Pending') {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'Only pending borrow requests can be edited' });
    }

    const itemResult = await client.query(
      `SELECT item_name, unit_of_measure, quantity_on_hand, is_borrowable, is_returnable, maximum_borrow_days, requires_mr
       FROM inventory_items WHERE item_id=$1 AND is_active=true FOR UPDATE`,
      [item_id]
    );
    const item = itemResult.rows[0];
    if (!item) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Item not found' });
    }
    if (item.is_borrowable === false) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: `${item.item_name} is classified as not borrowable` });
    }
    if (!item.is_returnable) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'This item is not returnable and cannot be borrowed' });
    }
    if (item.quantity_on_hand < parsedQuantity) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: `Insufficient stock for ${item.item_name}: requested ${parsedQuantity}, available ${item.quantity_on_hand}.` });
    }

    const maxDays = Number(item.maximum_borrow_days) > 0 ? Number(item.maximum_borrow_days) : null;
    const todayMs = utcDateOnly(new Date().toISOString().slice(0, 10));
    let expectedMs = expected_return_date ? utcDateOnly(expected_return_date) : null;

    if (expected_return_date && expectedMs === null) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Invalid expected return date' });
    }
    if (expectedMs !== null && expectedMs < todayMs) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Expected return date cannot be earlier than today' });
    }
    if (maxDays) {
      const maxMs = todayMs + maxDays * DAY_MS;
      if (expectedMs === null) {
        expectedMs = maxMs;
      } else if (expectedMs > maxMs) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: `Maximum borrowing period for ${item.item_name} is ${maxDays} day(s). Expected return date must be on or before ${formatDate(maxMs)}.` });
      }
    } else if (expectedMs === null) {
      expectedMs = current.expected_return_date
        ? utcDateOnly(current.expected_return_date)
        : todayMs + DEFAULT_BORROW_DAYS * DAY_MS;
    }

    const expectedReturnDate = formatDate(expectedMs);
    const mrNumberValue = (mr_number || '').toString().trim() || current.mr_number || null;
    if (item.requires_mr && !mrNumberValue) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'An MR (Memorandum Receipt) number is required for this item' });
    }

    await client.query(
      `UPDATE borrow_transactions
       SET item_id=$1, quantity_borrowed=$2, expected_return_date=$3, purpose=$4,
           borrower_name=$5, division_id=$6, mr_number=$7,
           mr_date = CASE WHEN $7::varchar IS NULL THEN mr_date ELSE CURRENT_DATE END
       WHERE borrow_id=$8`,
      [item_id, parsedQuantity, expectedReturnDate, purpose || null, borrower_name.trim(), division_id, mrNumberValue, id]
    );

    const updated = await client.query('SELECT * FROM borrow_transactions WHERE borrow_id=$1', [id]);

    await client.query(
      'INSERT INTO audit_log (user_id, username, action, table_name, record_id, old_values, new_values) VALUES ($1,$2,$3,$4,$5,$6)',
      [
        req.user.user_id,
        req.user.username || null,
        'UPDATE',
        'borrow_transactions',
        String(id),
        JSON.stringify({
          status: current.status,
          item_id: current.item_id,
          quantity_borrowed: current.quantity_borrowed,
          expected_return_date: current.expected_return_date,
          purpose: current.purpose,
          borrower_name: current.borrower_name
        }),
        JSON.stringify({
          ...updated.rows[0],
          item_name: item.item_name,
          previous_quantity: current.quantity_borrowed,
          quantity_on_hand: item.quantity_on_hand
        })
      ]
    );

    await createNotification(client, {
      type: NOTIFICATION_TYPES.BORROW_UPDATED,
      title: 'Borrow request updated',
      message: `${borrower_name.trim()} updated borrow request #${id}: ${parsedQuantity} ${item.unit_of_measure || 'unit(s)'} of ${item.item_name} (was ${current.quantity_borrowed}), return by ${expectedReturnDate}.`,
      link: '/transactions',
      referenceId: id,
      excludeUserId: req.user.user_id
    });

    await client.query('COMMIT');
    return res.status(200).json(updated.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error(err);
    return res.status(err.statusCode || 500).json({ error: err.message || 'Server error' });
  } finally {
    client.release();
  }
}

async function handleDelete(req, res, id) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const existing = await client.query(
      'SELECT * FROM borrow_transactions WHERE borrow_id=$1 FOR UPDATE',
      [id]
    );
    const current = existing.rows[0];
    if (!current) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Transaction not found' });
    }
    if (current.user_id !== req.user.user_id) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'You can only delete your own borrow requests' });
    }
    if (current.status !== 'Pending') {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'Only pending borrow requests can be deleted' });
    }

    const itemResult = await client.query(
      'SELECT item_name, unit_of_measure FROM inventory_items WHERE item_id=$1',
      [current.item_id]
    );
    const item = itemResult.rows[0] || {};

    await client.query('DELETE FROM borrow_transactions WHERE borrow_id=$1', [id]);

    await client.query(
      'INSERT INTO audit_log (user_id, username, action, table_name, record_id, old_values, new_values) VALUES ($1,$2,$3,$4,$5,$6)',
      [
        req.user.user_id,
        req.user.username || null,
        'DELETE',
        'borrow_transactions',
        String(id),
        JSON.stringify(current),
        null
      ]
    );

    await createNotification(client, {
      type: NOTIFICATION_TYPES.BORROW_DELETED,
      title: 'Borrow request deleted',
      message: `${req.user.full_name || req.user.username} deleted borrow request #${id} — ${current.quantity_borrowed} ${item.unit_of_measure || 'unit(s)'} of ${item.item_name || 'item'}.`,
      link: '/transactions',
      referenceId: id,
      excludeUserId: req.user.user_id
    });

    await client.query('COMMIT');
    return res.status(200).json({ message: 'Borrow request deleted', borrow_id: id });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error(err);
    return res.status(err.statusCode || 500).json({ error: err.message || 'Server error' });
  } finally {
    client.release();
  }
}

async function handler(req, res) {
  const { borrow_id } = req.query;
  const id = Number(borrow_id);
  if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: 'Invalid transaction id' });

  if (req.method === 'DELETE') {
    return handleDelete(req, res, id);
  }

  if (req.method !== 'PUT') return res.status(405).end();

  const { status } = req.body || {};
  if (typeof status === 'undefined' || status === null || status === '') {
    return handleFieldEdit(req, res, id);
  }

  return handleStatusChange(req, res, id);
}

export default withAuth(handler, 1);
