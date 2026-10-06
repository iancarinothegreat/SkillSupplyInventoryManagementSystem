import fs from 'fs';
import pg from 'pg';
import { createClient } from '@supabase/supabase-js';

const env = fs.readFileSync('.env.local', 'utf8');
for (const line of env.split(/\r?\n/)) {
  const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (match) process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
}

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 10000 });
const client = await pool.connect();
let deletedReports = 0;
let deletedAudit = 0;
try {
  await client.query('BEGIN');
  const reports = await client.query('SELECT COUNT(*)::int AS count FROM incident_reports');
  const audit = await client.query("SELECT COUNT(*)::int AS count FROM audit_log WHERE table_name = 'incident_reports'");
  const auditDelete = await client.query("DELETE FROM audit_log WHERE table_name = 'incident_reports'");
  const reportDelete = await client.query('DELETE FROM incident_reports');
  await client.query('COMMIT');
  deletedReports = reportDelete.rowCount;
  deletedAudit = auditDelete.rowCount;
  console.log(JSON.stringify({ beforeReports: reports.rows[0].count, beforeAudit: audit.rows[0].count, deletedReports, deletedAudit }, null, 2));
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  client.release();
  await pool.end();
}

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
const bucket = supabase.storage.from(process.env.SUPABASE_BACKUP_BUCKET || 'database-backups');
const { data: entries, error: listError } = await bucket.list('', { limit: 100 });
if (listError) throw listError;
const backups = (entries || []).filter((entry) => /^backup_[A-Za-z0-9T._-]+\.sql$/.test(entry.name));
for (const entry of backups) {
  const { data: file, error: downloadError } = await bucket.download(entry.name);
  if (downloadError) throw downloadError;
  const original = await file.text();
  const sanitized = original
    .replace(/-- Table: incident_reports\nTRUNCATE TABLE public\.incident_reports CASCADE;\n(?:INSERT INTO public\.incident_reports[^\n]*\n)*\n/g, '')
    .split('\n')
    .filter((line) => !(line.startsWith('INSERT INTO public.audit_log') && line.includes("'incident_reports'")))
    .join('\n');
  const { error: uploadError } = await bucket.upload(entry.name, Buffer.from(sanitized, 'utf8'), { contentType: 'application/sql', upsert: true });
  if (uploadError) throw uploadError;
  console.log(JSON.stringify({ backup: entry.name, removedIncidentRows: (original.match(/INSERT INTO public\.incident_reports/g) || []).length - (sanitized.match(/INSERT INTO public\.incident_reports/g) || []).length }));
}
