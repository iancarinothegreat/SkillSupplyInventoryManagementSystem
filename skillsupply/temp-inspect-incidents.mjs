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
try {
  const count = async (sql) => (await client.query(sql)).rows[0].count;
  console.log(JSON.stringify({
    incidentReports: await count('SELECT COUNT(*)::int AS count FROM incident_reports'),
    incidentAudit: await count("SELECT COUNT(*)::int AS count FROM audit_log WHERE table_name = 'incident_reports'"),
    incidentAuditPayloads: await count("SELECT COUNT(*)::int AS count FROM audit_log WHERE table_name <> 'incident_reports' AND (COALESCE(old_values::text,'') ILIKE '%incident%' OR COALESCE(new_values::text,'') ILIKE '%incident%')")
  }, null, 2));
} finally {
  client.release();
  await pool.end();
}

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
const { data, error } = await supabase.storage.from(process.env.SUPABASE_BACKUP_BUCKET || 'database-backups').list('', { limit: 100, sortBy: { column: 'created_at', order: 'desc' } });
if (error) throw error;
console.log(JSON.stringify({ backups: (data || []).filter((entry) => /^backup_[A-Za-z0-9T._-]+\.sql$/.test(entry.name)).map((entry) => entry.name) }, null, 2));
for (const entry of (data || []).filter((item) => /^backup_[A-Za-z0-9T._-]+\.sql$/.test(item.name))) {
  const { data: file, error: downloadError } = await supabase.storage.from(process.env.SUPABASE_BACKUP_BUCKET || 'database-backups').download(entry.name);
  if (downloadError) throw downloadError;
  const content = await file.text();
  console.log(JSON.stringify({ backup: entry.name, incidentRows: (content.match(/INSERT INTO public\.incident_reports/g) || []).length }, null, 2));
}
