import jwt from 'jsonwebtoken';

const SECRET = process.env.JWT_SECRET;

export function signToken(payload) {
  return jwt.sign(payload, SECRET, { expiresIn: '8h' });
}

export function verifyToken(token) {
  try {
    return jwt.verify(token, SECRET);
  } catch {
    return null;
  }
}

export function getTokenFromRequest(req) {
  const headers = req?.headers || {};
  // Support common casing variants and different header shapes.
  const auth =
    headers.authorization ||
    headers.Authorization ||
    headers.AUTHORIZATION ||
    null;

  if (!auth || !String(auth).toLowerCase().startsWith('bearer ')) return null;
  return String(auth).split(' ')[1];
}
