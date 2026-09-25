import { query } from '../../../lib/db.js';
import { writeFile, readdir, unlink, mkdir } from 'fs/promises';
import { join } from 'path';

const BACKUP_DIR = join(process.cwd(), 'backups');
const RETENTION_COUNT = 10;

const TABLES = [
  'roles', 'users', 'categories', 'divisions', 'inventory_items',
  'borrow_transactions', 'return_transactions', 'requisitions',
  'requisition_items', 'consumption_tracking', 'audit_log', 'login_audit',
  'incident_reports', 'forecast_data'
];

async function ensureBackupDir() {
  try {
    await mkdir(BACKUP_DIR, { recursive: true });
    const testFile = join(BACKUP_DIR, '.write-test');
    await writeFile(testFile, 'ok', 'utf8');
    await unlink(testFile);
    return true;
  } catch {
    return false;
  }
}

export default async function handler(req, res) {
  if (!['GET', 'POST'].includes(req.method)) return res.status(405).end();

  const authorization = req.headers.authorization || '';
  const bearerSecret = authorization.startsWith('Bearer ')
    ? authorization.slice('Bearer '.length)
    : null;
  const providedSecret = bearerSecret || req.body?.secret;
  const expectedSecret = process.env.CRON_SECRET || process.env.BACKUP_SECRET;
  if (!expectedSecret || providedSecret !== expectedSecret) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const fsAvailable = await ensureBackupDir();
  if (!fsAvailable) {
    return res.status(503).json({
      error: 'Backup is not available in this environment',
      message: 'Serverless filesystem is ephemeral. Use Supabase dashboard backups instead.'
    });
  }

  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `backup_${timestamp}.sql`;
    const filepath = join(BACKUP_DIR, filename);

    let sql = `-- SkillSupply Scheduled Backup\n-- Created: ${new Date().toISOString()}\n\n`;

    for (const table of TABLES) {
      try {
        const columnsResult = await query(
          `SELECT column_name FROM information_schema.columns WHERE table_name = $1 ORDER BY ordinal_position`,
          [table]
        );
        if (columnsResult.rows.length === 0) continue;

        const columns = columnsResult.rows.map(r => r.column_name);
        const dataResult = await query(`SELECT * FROM ${table}`);

        sql += `TRUNCATE TABLE ${table} CASCADE;\n`;
        for (const row of dataResult.rows) {
          const values = columns.map(col => {
            const val = row[col];
            if (val === null) return 'NULL';
            if (typeof val === 'boolean') return val ? 'TRUE' : 'FALSE';
            if (typeof val === 'number') return String(val);
            if (typeof val === 'object') return `'${String(JSON.stringify(val)).replace(/'/g, "''")}'`;
            return `'${String(val).replace(/'/g, "''")}'`;
          });
          sql += `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${values.join(', ')});\n`;
        }
        sql += '\n';
      } catch (err) {
        sql += `-- Error: ${table}: ${err.message}\n\n`;
      }
    }

    await writeFile(filepath, sql, 'utf8');

    const files = await readdir(BACKUP_DIR);
    const backupFiles = files.filter(f => f.startsWith('backup_') && f.endsWith('.sql'));
    if (backupFiles.length > RETENTION_COUNT) {
      const sorted = backupFiles.sort();
      for (let i = 0; i < sorted.length - RETENTION_COUNT; i++) {
        await unlink(join(BACKUP_DIR, sorted[i])).catch(() => {});
      }
    }

    return res.status(200).json({ success: true, filename });
  } catch (err) {
    console.error('Scheduled backup error:', err);
    return res.status(500).json({ error: 'Scheduled backup failed' });
  }
}
