import { query, transaction } from '../../../lib/db.js';
import { withAuth } from '../../../lib/rbac.js';
import { readFile, unlink, stat, writeFile, mkdir } from 'fs/promises';
import { join } from 'path';

const BACKUP_DIR = join(process.cwd(), 'backups');
const metadataPath = (filename) => join(BACKUP_DIR, `${filename}.meta.json`);

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

function normalizeMetadata(metadata = {}) {
  return {
    retentionDate: metadata.retentionDate || '',
    recoveryNotes: metadata.recoveryNotes || '',
    createdBy: metadata.createdBy || 'System administrator'
  };
}

async function handler(req, res) {
  const fsAvailable = await ensureBackupDir();
  if (!fsAvailable) {
    return res.status(503).json({
      error: 'Backup is not available in this environment',
      message: 'Serverless filesystem is ephemeral. Use Supabase dashboard backups instead.'
    });
  }

  const { filename } = req.query;

  if (req.method === 'GET') {
    try {
      const filepath = join(BACKUP_DIR, filename);
      const fileStat = await stat(filepath);
      const content = await readFile(filepath, 'utf8');
      let metadata = {};
      try {
        metadata = JSON.parse(await readFile(metadataPath(filename), 'utf8'));
      } catch (err) {
        // Older backups do not have metadata yet.
      }
      const lines = content.split('\n');
      const tables = [...new Set(lines.filter(l => l.startsWith('-- Table:')).map(l => l.replace('-- Table: ', '').trim()))];
      const tableCount = tables.length;
      const insertCount = lines.filter(l => l.startsWith('INSERT INTO')).length;

      return res.status(200).json({
        filename,
        size: fileStat.size,
        created: fileStat.birthtime.toISOString(),
        sizeFormatted: fileStat.size > 1024 * 1024
          ? `${(fileStat.size / (1024 * 1024)).toFixed(1)} MB`
          : `${(fileStat.size / 1024).toFixed(1)} KB`,
        tableCount,
        tables,
        insertCount,
        content,
        ...normalizeMetadata(metadata)
      });
    } catch (err) {
      return res.status(404).json({ error: 'Backup not found' });
    }
  }

  if (req.method === 'PATCH') {
    try {
      await stat(join(BACKUP_DIR, filename));
      const metadata = normalizeMetadata(req.body || {});
      await writeFile(metadataPath(filename), JSON.stringify(metadata, null, 2), 'utf8');
      return res.status(200).json({ success: true, ...metadata });
    } catch (err) {
      return res.status(404).json({ error: 'Backup not found' });
    }
  }

  if (req.method === 'POST') {
    try {
      if (!filename.startsWith('backup_') || !filename.endsWith('.sql')) {
        return res.status(400).json({ error: 'Invalid backup file' });
      }
      const filepath = join(BACKUP_DIR, filename);
      const content = await readFile(filepath, 'utf8');

      const result = await transaction(async (client) => {
        // Prevent a blocked database lock from leaving the UI in "Restoring..." forever.
        await client.query("SET LOCAL statement_timeout = '120s'");
        await client.query(content);
        return { executed: (content.match(/;/g) || []).length };
      });

      await query(
        `INSERT INTO audit_log (user_id, action, table_name, new_values)
         VALUES ($1, 'RESTORE', 'backup_files', $2)`,
        [req.user.user_id, JSON.stringify({ filename, operation: 'backup_restored', statements: result.executed })]
      );

      return res.status(200).json({
        success: true,
        message: `Restore completed successfully. ${result.executed} statements executed.`,
        executed: result.executed,
        errors: 0
      });
    } catch (err) {
      console.error('Restore failed:', err.message);
      return res.status(500).json({
        error: 'Restore failed and was rolled back',
        details: err.message
      });
    }
  }

  if (req.method === 'DELETE') {
    try {
      const filepath = join(BACKUP_DIR, filename);
      await unlink(filepath);
      await unlink(metadataPath(filename)).catch(() => {});
      await query(
        `INSERT INTO audit_log (user_id, action, table_name, old_values)
         VALUES ($1, 'DELETE', 'backup_files', $2)`,
        [req.user.user_id, JSON.stringify({ filename, operation: 'backup_deleted' })]
      );
      return res.status(200).json({ success: true, message: 'Backup deleted' });
    } catch (err) {
      return res.status(404).json({ error: 'Backup not found' });
    }
  }

  return res.status(405).end();
}

export default withAuth(handler, 3);
