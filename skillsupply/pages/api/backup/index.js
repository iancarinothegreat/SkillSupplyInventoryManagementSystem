import { query } from '../../../lib/db.js';
import { withAuth } from '../../../lib/rbac.js';
import { writeFile, readdir, stat, unlink, readFile, mkdir } from 'fs/promises';
import { join } from 'path';

const BACKUP_DIR = join(process.cwd(), 'backups');

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
const RETENTION_COUNT = 10;

const TABLES = [
  'roles', 'users', 'categories', 'divisions', 'inventory_items',
  'borrow_transactions', 'return_transactions', 'requisitions',
  'requisition_items', 'consumption_tracking', 'audit_log', 'login_audit',
  'incident_reports', 'forecast_data'
];

const metadataPath = (filename) => join(BACKUP_DIR, `${filename}.meta.json`);

function normalizeMetadata(metadata = {}) {
  return {
    retentionDate: metadata.retentionDate || '',
    recoveryNotes: metadata.recoveryNotes || '',
    createdBy: metadata.createdBy || 'System administrator'
  };
}

async function createBackup(metadata) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `backup_${timestamp}.sql`;
  const filepath = join(BACKUP_DIR, filename);

  let sql = `-- SkillSupply Database Backup\n-- Created: ${new Date().toISOString()}\n-- Tables: ${TABLES.join(', ')}\n\n`;

  for (const table of TABLES) {
    try {
      const columnsResult = await query(
        `SELECT column_name, data_type FROM information_schema.columns WHERE table_name = $1 ORDER BY ordinal_position`,
        [table]
      );
      if (columnsResult.rows.length === 0) continue;

      const columns = columnsResult.rows.map(r => r.column_name);
      const dataResult = await query(`SELECT * FROM ${table}`);
      
      sql += `-- Table: ${table}\n`;
      sql += `TRUNCATE TABLE ${table} CASCADE;\n`;

      if (dataResult.rows.length > 0) {
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
      }
      sql += '\n';
    } catch (err) {
      sql += `-- Error backing up ${table}: ${err.message}\n\n`;
    }
  }

  await writeFile(filepath, sql, 'utf8');
  await writeFile(metadataPath(filename), JSON.stringify(normalizeMetadata(metadata), null, 2), 'utf8');

  const files = await readdir(BACKUP_DIR);
  const backupFiles = files.filter(f => f.startsWith('backup_') && f.endsWith('.sql'));
  if (backupFiles.length > RETENTION_COUNT) {
    const sorted = backupFiles.sort();
    for (let i = 0; i < sorted.length - RETENTION_COUNT; i++) {
      await unlink(join(BACKUP_DIR, sorted[i])).catch(() => {});
    }
  }

  return { filename, filepath };
}

async function handler(req, res) {
  const fsAvailable = await ensureBackupDir();
  if (!fsAvailable) {
    return res.status(503).json({
      error: 'Backup is not available in this environment',
      message: 'Serverless filesystem is ephemeral. Use Supabase dashboard backups instead.'
    });
  }

  if (req.method === 'GET') {
    try {
      const files = await readdir(BACKUP_DIR);
      const backups = [];
      for (const file of files) {
        if (!file.startsWith('backup_') || !file.endsWith('.sql')) continue;
        const fileStat = await stat(join(BACKUP_DIR, file));
        let metadata = {};
        try {
          metadata = JSON.parse(await readFile(metadataPath(file), 'utf8'));
        } catch (err) {
          // Older backups do not have metadata yet.
        }
        backups.push({
          filename: file,
          size: fileStat.size,
          created: fileStat.birthtime.toISOString(),
          sizeFormatted: fileStat.size > 1024 * 1024
            ? `${(fileStat.size / (1024 * 1024)).toFixed(1)} MB`
            : `${(fileStat.size / 1024).toFixed(1)} KB`,
          ...normalizeMetadata(metadata)
        });
      }
      backups.sort((a, b) => new Date(b.created) - new Date(a.created));
      return res.status(200).json({ backups });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: 'Failed to list backups' });
    }
  }

  if (req.method === 'POST') {
    try {
      const { filename } = await createBackup(req.body || {});
      await query(
        `INSERT INTO audit_log (user_id, action, table_name, new_values)
         VALUES ($1, 'CREATE', 'backup_files', $2)`,
        [req.user.user_id, JSON.stringify({ filename, operation: 'backup_created' })]
      );
      return res.status(200).json({ success: true, filename, message: 'Backup created successfully' });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: 'Failed to create backup' });
    }
  }

  return res.status(405).end();
}

export default withAuth(handler, 3);
