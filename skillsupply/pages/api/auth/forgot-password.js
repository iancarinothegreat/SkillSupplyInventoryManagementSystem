import crypto from 'crypto';
import { query } from '../../../lib/db.js';
import { sendPasswordResetEmail } from '../../../lib/mailer.js';

const TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { email } = req.body;
  const normalizedEmail = (email || '').trim().toLowerCase();

  if (!normalizedEmail)
    return res.status(400).json({ error: 'Email is required' });

  // Always return a generic success message to prevent email enumeration
  const genericResponse = {
    message: 'If an account exists with that email, a password reset link has been sent.'
  };

  try {
    const result = await query(
      'SELECT user_id, full_name, is_active FROM users WHERE email = $1',
      [normalizedEmail]
    );

    const user = result.rows[0];
    if (!user || !user.is_active) {
      return res.status(200).json(genericResponse);
    }

    // Generate a secure random token
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);

    // Store the token and expiry
    await query(
      'UPDATE users SET reset_token = $1, reset_expires_at = $2 WHERE user_id = $3',
      [token, expiresAt, user.user_id]
    );

    // Build the reset URL (frontend will use ?token=... param)
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const resetUrl = `${baseUrl}/reset-password?token=${token}`;

    try {
      await sendPasswordResetEmail({
        to: normalizedEmail,
        fullName: user.full_name,
        resetUrl,
      });
      console.log(`[forgot-password] Reset email sent to ${normalizedEmail}`);
    } catch (emailErr) {
      console.error('[forgot-password] Failed to send reset email:', emailErr.message);
      // In dev, surface the error so you can debug
      if (process.env.NODE_ENV !== 'production') {
        return res.status(500).json({
          error: `Failed to send email: ${emailErr.message}. Check GMAIL_USER and GMAIL_APP_PASSWORD in .env.local.`,
        });
      }
      return res.status(200).json(genericResponse);
    }

    return res.status(200).json(genericResponse);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
}
