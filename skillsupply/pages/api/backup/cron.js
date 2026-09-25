import {
  createBackupFilename,
  enforceRetention,
  generateBackupSql,
  uploadBackup
} from '../../../lib/backup-storage.js';

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

  try {
    const filename = createBackupFilename();
    const sql = await generateBackupSql();
    await uploadBackup(filename, sql, { createdBy: 'Vercel Cron' });
    await enforceRetention();
    return res.status(200).json({ success: true, filename, storage: 'supabase' });
  } catch (error) {
    console.error('Scheduled backup error:', error);
    return res.status(500).json({ error: 'Scheduled backup failed' });
  }
}
