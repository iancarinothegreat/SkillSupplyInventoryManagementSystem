import { withAuth } from '../../../lib/rbac.js';
import { verifyAuditChain } from '../../../lib/audit-hash.js';

async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  try {
    const result = await verifyAuditChain();
    return res.status(200).json(result);
  } catch (err) {
    console.error('Audit verification error:', err);
    return res.status(500).json({ error: 'Failed to verify audit chain' });
  }
}

export default withAuth(handler, 3);
