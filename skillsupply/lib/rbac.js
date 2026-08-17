import { verifyToken, getTokenFromRequest } from './auth.js';

export function withAuth(handler, minLevel = 1) {
  return async (req, res) => {
    const token = getTokenFromRequest(req);
    if (!token) return res.status(401).json({ error: 'Unauthorized' });

    const decoded = verifyToken(token);
    if (!decoded) return res.status(401).json({ error: 'Invalid token' });

    if (decoded.hierarchy_level < minLevel) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    req.user = decoded;
    return handler(req, res);
  };
}
