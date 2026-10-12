export default async function handler(req, res) {
  return res.status(403).json({ error: 'Public account creation is disabled. Contact an administrator.' });
}
