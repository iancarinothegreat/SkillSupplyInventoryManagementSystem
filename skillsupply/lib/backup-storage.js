import { createClient } from '@supabase/supabase-js';
import { query } from './db.js';

export const BACKUP_BUCKET = process.env.SUPABASE_BACKUP_BUCKET || 'database-backups';
export const RETENTION_COUNT = 10;

export const TABLES = [
  'roles', 'users', 'categories', 'divisions', 'inventory_items',
  'borrow_transactions', 'return_transactions', 'requisitions',
  'requisition_items', 'consumption_tracking', 'audit_log', 'login_audit',
  'forecast_data'
];

export function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error('Supabase Storage is not configured. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY.');
  }

  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
}

export function normalizeMetadata(metadata = {}) {
  return {
    retentionDate: metadata.retentionDate || '',
    recoveryNotes: metadata.recoveryNotes || '',
    createdBy: metadata.createdBy || 'System administrator'
  };
}

export function validateFilename(filename) {
  return typeof filename === 'string' && /^backup_[A-Za-z0-9T._-]+\.sql$/.test(filename);
}

function metadataFilename(filename) {
  return `${filename}.meta.json`;
}

export async function generateBackupSql() {
  const timestamp = new Date().toISOString();
  let sql = `-- SkillSupply Database Backup\n-- Created: ${timestamp}\n-- Tables: ${TABLES.join(', ')}\n\n`;

  for (const table of TABLES) {
    try {
      const columnsResult = await query(
        `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1 ORDER BY ordinal_position`,
        [table]
      );
      if (columnsResult.rows.length === 0) continue;

      const columns = columnsResult.rows.map((row) => row.column_name);
      const dataResult = await query(`SELECT * FROM public.${table}`);

      sql += `-- Table: ${table}\n`;
      sql += `TRUNCATE TABLE public.${table} CASCADE;\n`;

      for (const row of dataResult.rows) {
        const values = columns.map((column) => {
          const value = row[column];
          if (value === null) return 'NULL';
          if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
          if (typeof value === 'number') return String(value);
          if (typeof value === 'object') return `'${String(JSON.stringify(value)).replace(/'/g, "''")}'`;
          return `'${String(value).replace(/'/g, "''")}'`;
        });
        sql += `INSERT INTO public.${table} (${columns.join(', ')}) VALUES (${values.join(', ')});\n`;
      }
      sql += '\n';
    } catch (error) {
      sql += `-- Error backing up ${table}: ${error.message}\n\n`;
    }
  }

  return sql;
}

export async function uploadBackup(filename, content, metadata = {}) {
  const supabase = getSupabaseAdmin();
  const bucket = supabase.storage.from(BACKUP_BUCKET);
  const { error: contentError } = await bucket.upload(filename, Buffer.from(content, 'utf8'), {
    contentType: 'application/sql',
    upsert: false
  });
  if (contentError) throw contentError;

  const { error: metadataError } = await bucket.upload(
    metadataFilename(filename),
    Buffer.from(JSON.stringify(normalizeMetadata(metadata), null, 2), 'utf8'),
    { contentType: 'application/json', upsert: true }
  );
  if (metadataError) throw metadataError;
}

export async function downloadBackup(filename) {
  if (!validateFilename(filename)) throw new Error('Invalid backup filename');
  const { data, error } = await getSupabaseAdmin().storage.from(BACKUP_BUCKET).download(filename);
  if (error) throw error;
  return Buffer.from(await data.arrayBuffer());
}

export async function downloadMetadata(filename) {
  const { data, error } = await getSupabaseAdmin().storage.from(BACKUP_BUCKET).download(metadataFilename(filename));
  if (error) return {};
  try {
    return JSON.parse(Buffer.from(await data.arrayBuffer()).toString('utf8'));
  } catch {
    return {};
  }
}

export async function listBackups() {
  const { data, error } = await getSupabaseAdmin().storage.from(BACKUP_BUCKET).list('', {
    limit: 100,
    sortBy: { column: 'created_at', order: 'desc' }
  });
  if (error) throw error;

  const backups = [];
  for (const file of (data || []).filter((entry) => validateFilename(entry.name))) {
    const content = await downloadBackup(file.name);
    const metadata = await downloadMetadata(file.name);
    const created = file.created_at || file.updated_at || new Date().toISOString();
    backups.push({
      filename: file.name,
      size: content.length,
      created,
      sizeFormatted: content.length > 1024 * 1024
        ? `${(content.length / (1024 * 1024)).toFixed(1)} MB`
        : `${(content.length / 1024).toFixed(1)} KB`,
      ...normalizeMetadata(metadata)
    });
  }
  return backups.sort((a, b) => new Date(b.created) - new Date(a.created));
}

export async function updateBackupMetadata(filename, metadata) {
  if (!validateFilename(filename)) throw new Error('Invalid backup filename');
  const { error } = await getSupabaseAdmin().storage.from(BACKUP_BUCKET).upload(
    metadataFilename(filename),
    Buffer.from(JSON.stringify(normalizeMetadata(metadata), null, 2), 'utf8'),
    { contentType: 'application/json', upsert: true }
  );
  if (error) throw error;
}

export async function deleteBackup(filename) {
  if (!validateFilename(filename)) throw new Error('Invalid backup filename');
  const { error } = await getSupabaseAdmin().storage.from(BACKUP_BUCKET).remove([
    filename,
    metadataFilename(filename)
  ]);
  if (error) throw error;
}

export async function enforceRetention() {
  const backups = await listBackups();
  const expired = backups.slice(RETENTION_COUNT);
  for (const backup of expired) await deleteBackup(backup.filename);
}

export function backupDetails(filename, content, metadata = {}) {
  const text = content.toString('utf8');
  const lines = text.split('\n');
  const tables = [...new Set(lines
    .filter((line) => line.startsWith('-- Table:'))
    .map((line) => line.replace('-- Table: ', '').trim()))];
  return {
    filename,
    size: content.length,
    created: new Date().toISOString(),
    sizeFormatted: content.length > 1024 * 1024
      ? `${(content.length / (1024 * 1024)).toFixed(1)} MB`
      : `${(content.length / 1024).toFixed(1)} KB`,
    tableCount: tables.length,
    tables,
    insertCount: lines.filter((line) => line.startsWith('INSERT INTO')).length,
    content: text,
    ...normalizeMetadata(metadata)
  };
}

export function createBackupFilename() {
  return `backup_${new Date().toISOString().replace(/[:.]/g, '-')}.sql`;
}
