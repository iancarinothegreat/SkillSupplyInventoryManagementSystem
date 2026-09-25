import { query, transaction } from '../../../lib/db.js';
import { withAuth } from '../../../lib/rbac.js';
import {
  backupDetails,
  deleteBackup,
  downloadBackup,
  downloadMetadata,
  normalizeMetadata,
  updateBackupMetadata,
  validateFilename
} from '../../../lib/backup-storage.js';

async function handler(req, res) {
  const { filename } = req.query;
  if (!validateFilename(filename)) return res.status(400).json({ error: 'Invalid backup file' });

  if (req.method === 'GET') {
    try {
      const content = await downloadBackup(filename);
      const metadata = await downloadMetadata(filename);
      return res.status(200).json(backupDetails(filename, content, metadata));
    } catch (error) {
      console.error('Backup download failed:', error);
      return res.status(404).json({ error: 'Backup not found' });
    }
  }

  if (req.method === 'PATCH') {
    try {
      await downloadBackup(filename);
      const metadata = normalizeMetadata(req.body || {});
      await updateBackupMetadata(filename, metadata);
      return res.status(200).json({ success: true, ...metadata });
    } catch (error) {
      console.error('Backup metadata update failed:', error);
      return res.status(404).json({ error: 'Backup not found' });
    }
  }

  if (req.method === 'POST') {
    try {
      const content = (await downloadBackup(filename)).toString('utf8');
      const result = await transaction(async (client) => {
        await client.query("SET LOCAL statement_timeout = '120s'");
        await client.query(content);
        return { executed: (content.match(/;/g) || []).length };
      });

      await query(
        `INSERT INTO audit_log (user_id, action, table_name, new_values)
         VALUES ($1, 'RESTORE', 'backup_files', $2)`,
        [req.user.user_id, JSON.stringify({ filename, operation: 'backup_restored', statements: result.executed, storage: 'supabase' })]
      );

      return res.status(200).json({
        success: true,
        message: `Restore completed successfully. ${result.executed} statements executed.`,
        executed: result.executed,
        errors: 0
      });
    } catch (error) {
      console.error('Restore failed:', error.message);
      return res.status(500).json({ error: 'Restore failed and was rolled back', details: error.message });
    }
  }

  if (req.method === 'DELETE') {
    try {
      await deleteBackup(filename);
      await query(
        `INSERT INTO audit_log (user_id, action, table_name, old_values)
         VALUES ($1, 'DELETE', 'backup_files', $2)`,
        [req.user.user_id, JSON.stringify({ filename, operation: 'backup_deleted', storage: 'supabase' })]
      );
      return res.status(200).json({ success: true, message: 'Backup deleted' });
    } catch (error) {
      console.error('Backup delete failed:', error);
      return res.status(404).json({ error: 'Backup not found' });
    }
  }

  return res.status(405).end();
}

export default withAuth(handler, 3);
