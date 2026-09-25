import { query } from '../../../lib/db.js';
import { withAuth } from '../../../lib/rbac.js';
import {
  createBackupFilename,
  enforceRetention,
  generateBackupSql,
  listBackups,
  normalizeMetadata,
  uploadBackup
} from '../../../lib/backup-storage.js';

async function handler(req, res) {
  if (req.method === 'GET') {
    try {
      return res.status(200).json({ backups: await listBackups() });
    } catch (error) {
      console.error('Failed to list backups:', error);
      return res.status(500).json({ error: 'Failed to list backups' });
    }
  }

  if (req.method === 'POST') {
    try {
      const filename = createBackupFilename();
      const sql = await generateBackupSql();
      await uploadBackup(filename, sql, normalizeMetadata(req.body || {}));
      await enforceRetention();

      await query(
        `INSERT INTO audit_log (user_id, action, table_name, new_values)
         VALUES ($1, 'CREATE', 'backup_files', $2)`,
        [req.user.user_id, JSON.stringify({ filename, operation: 'backup_created', storage: 'supabase' })]
      );
      return res.status(200).json({ success: true, filename, message: 'Backup created successfully' });
    } catch (error) {
      console.error('Failed to create backup:', error);
      return res.status(500).json({ error: 'Failed to create backup' });
    }
  }

  return res.status(405).end();
}

export default withAuth(handler, 3);
