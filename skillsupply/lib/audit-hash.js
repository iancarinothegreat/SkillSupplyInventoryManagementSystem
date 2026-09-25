import { createHash } from 'crypto';
import { query } from './db.js';

function computeHash(auditId, userId, action, tableName, recordId, timestamp, previousHash) {
  const data = `${auditId}|${userId || ''}|${action}|${tableName || ''}|${recordId || ''}|${timestamp}|${previousHash || ''}`;
  return createHash('sha256').update(data).digest('hex');
}

export async function hashLatestAuditEntry() {
  const latest = await query(
    'SELECT audit_id, user_id, action, table_name, record_id, timestamp, previous_hash FROM audit_log WHERE entry_hash IS NULL ORDER BY audit_id DESC LIMIT 1'
  );

  if (latest.rows.length === 0) return null;

  const entry = latest.rows[0];
  const entryHash = computeHash(entry.audit_id, entry.user_id, entry.action, entry.table_name, entry.record_id, entry.timestamp, entry.previous_hash);

  await query('UPDATE audit_log SET entry_hash = $1 WHERE audit_id = $2', [entryHash, entry.audit_id]);

  return entryHash;
}

export async function hashAllUnhashedEntries() {
  const unhashed = await query(
    'SELECT audit_id, user_id, action, table_name, record_id, timestamp, previous_hash FROM audit_log WHERE entry_hash IS NULL ORDER BY audit_id ASC'
  );

  let previousHash = null;
  if (unhashed.rows.length > 0) {
    const firstHashed = await query(
      'SELECT entry_hash FROM audit_log WHERE entry_hash IS NOT NULL ORDER BY audit_id DESC LIMIT 1'
    );
    previousHash = firstHashed.rows[0]?.entry_hash || null;
  }

  for (const entry of unhashed.rows) {
    const entryHash = computeHash(entry.audit_id, entry.user_id, entry.action, entry.table_name, entry.record_id, entry.timestamp, previousHash);
    await query('UPDATE audit_log SET entry_hash = $1, previous_hash = COALESCE(previous_hash, $2) WHERE audit_id = $3', [entryHash, previousHash, entry.audit_id]);
    previousHash = entryHash;
  }

  return unhashed.rows.length;
}

export async function verifyAuditChain() {
  const result = await query(
    'SELECT audit_id, user_id, action, table_name, record_id, timestamp, entry_hash, previous_hash FROM audit_log ORDER BY audit_id ASC'
  );

  const entries = result.rows;
  let previousHash = null;
  let brokenAt = null;

  for (const entry of entries) {
    const expectedHash = computeHash(entry.audit_id, entry.user_id, entry.action, entry.table_name, entry.record_id, entry.timestamp, entry.previous_hash);

    if (entry.entry_hash !== expectedHash) {
      brokenAt = entry.audit_id;
      break;
    }
    if (entry.previous_hash !== previousHash) {
      brokenAt = entry.audit_id;
      break;
    }
    previousHash = entry.entry_hash;
  }

  return {
    valid: brokenAt === null,
    totalEntries: entries.length,
    brokenAtAuditId: brokenAt,
    verifiedAt: new Date().toISOString()
  };
}
