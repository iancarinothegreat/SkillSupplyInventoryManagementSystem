import { query } from '../../../lib/db.js';
import bcrypt from 'bcryptjs';

const PASSWORD_PATTERN = /^(?=.*[a-z])(?=.*[A-Z])(?=.*[^A-Za-z0-9]).{8,}$/;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { token, password, confirmPassword } = req.body;

  if (!token)
    return res.status(400).json({ error: 'Reset token is required' });

  if (!password || !confirmPassword)
    return res.status(400).json({ error: 'Password and confirmation are required' });

  if (password !== confirmPassword)
    return res.status(400).json({ error: 'Passwords do not match' });

  if (!PASSWORD_PATTERN.test(password)) {
    return res.status(400).json({
      error: 'Password must be at least 8 characters and include at least one uppercase letter, one lowercase letter, and one special character.'
    });
  }

  try {
    const result = await query(
      'SELECT user_id, reset_expires_at FROM users WHERE reset_token = $1',
      [token]
    );

    const user = result.rows[0];
    if (!user)
      return res.status(400).json({ error: 'Invalid or expired reset link' });

    if (!user.reset_expires_at) {
      return res.status(400).json({ error: 'Invalid or expired reset link' });
    }

    const expiresAt = new Date(user.reset_expires_at).getTime();
    if (Number.isNaN(expiresAt) || Date.now() > expiresAt) {
      // Invalidate the expired token
      await query(
        'UPDATE users SET reset_token = NULL, reset_expires_at = NULL WHERE user_id = $1',
        [user.user_id]
      );
      return res.status(400).json({ error: 'Reset link has expired. Please request a new one.' });
    }

    const hash = await bcrypt.hash(password, 12);

    // Update password and clear the reset token so it cannot be reused
    await query(
      'UPDATE users SET password_hash = $1, reset_token = NULL, reset_expires_at = NULL WHERE user_id = $2',
      [hash, user.user_id]
    );

    return res.status(200).json({ message: 'Password has been reset successfully. You can now sign in.' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
}
