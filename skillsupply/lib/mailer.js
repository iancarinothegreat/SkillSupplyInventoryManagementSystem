import nodemailer from 'nodemailer';

const GMAIL_USER = process.env.GMAIL_USER;
const GMAIL_APP_PASSWORD = process.env.GMAIL_APP_PASSWORD;

if (!GMAIL_USER || !GMAIL_APP_PASSWORD) {
  console.warn('GMAIL_USER and GMAIL_APP_PASSWORD are not set. Email sending will fail.');
}

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: GMAIL_USER,
    pass: GMAIL_APP_PASSWORD,
  },
});

export async function sendPasswordResetEmail({ to, fullName, resetUrl }) {
  const subject = 'SkillSupply — Password Reset Request';
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #1f2937;">
      <div style="background: #1a3a5c; color: white; padding: 20px; text-align: center;">
        <h1 style="margin: 0; font-size: 24px;">SkillSupply</h1>
        <p style="margin: 4px 0 0; font-size: 12px; color: #8fb3d4;">Supply Management Information System</p>
      </div>

      <div style="padding: 24px; background: #f9fafb;">
        <p>Hi <strong>${fullName || 'there'}</strong>,</p>
        <p>We received a request to reset the password for your SkillSupply account. Click the button below to set a new password.</p>

        <div style="text-align: center; margin: 28px 0;">
          <a href="${resetUrl}"
             style="background: #1a3a5c; color: white; padding: 12px 28px; text-decoration: none; border-radius: 8px; display: inline-block; font-weight: 600;">
            Reset Your Password
          </a>
        </div>

        <p style="color: #6b7280; font-size: 13px;">Or copy and paste this link into your browser:</p>
        <p style="background: #ffffff; padding: 10px; border: 1px solid #e5e7eb; border-radius: 6px; word-break: break-all; font-size: 12px;">
          ${resetUrl}
        </p>

        <p style="color: #dc2626; font-size: 13px;"><strong>This link will expire in 1 hour.</strong></p>
        <p style="color: #6b7280; font-size: 13px;">If you did not request a password reset, you can safely ignore this email — your account will remain secure.</p>
      </div>

      <div style="background: #e5e7eb; padding: 12px; text-align: center; font-size: 11px; color: #6b7280;">
        Mandaluyong Manpower Technical-Vocational Training Center (MMTVTC)<br/>
        This is an automated message. Please do not reply.
      </div>
    </div>
  `;

  const senderEmail = process.env.MAIL_FROM_EMAIL || GMAIL_USER;
  const senderName = process.env.MAIL_FROM_NAME || 'SkillSupply';

  return transporter.sendMail({
    from: `"${senderName}" <${senderEmail}>`,
    to,
    subject,
    html,
  });
}
