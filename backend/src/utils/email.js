/**
 * Email delivery for the OTP (second factor).
 *
 * Two modes, controlled by EMAIL_MODE:
 *   - "ethereal" (default): creates a throwaway Ethereal test account. No real
 *     email is sent; instead a preview URL is logged so you can open the message
 *     in the browser. Perfect for demos and grading with zero setup.
 *   - "smtp": sends real email via the configured SMTP_* credentials.
 */

const nodemailer = require('nodemailer');

let transporterPromise = null;

async function getTransporter() {
  if (transporterPromise) return transporterPromise;

  transporterPromise = (async () => {
    if (process.env.EMAIL_MODE === 'smtp') {
      return nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT || 587),
        secure: Number(process.env.SMTP_PORT) === 465,
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      });
    }
    // Default: Ethereal fake inbox.
    const testAccount = await nodemailer.createTestAccount();
    console.log('[email] Using Ethereal test inbox:', testAccount.user);
    return nodemailer.createTransport({
      host: 'smtp.ethereal.email',
      port: 587,
      secure: false,
      auth: { user: testAccount.user, pass: testAccount.pass },
    });
  })();

  return transporterPromise;
}

async function sendOtpEmail(to, otp) {
  const transporter = await getTransporter();
  const info = await transporter.sendMail({
    from: process.env.MAIL_FROM || '3FA Social <no-reply@example.com>',
    to,
    subject: 'Your 3FA login code',
    text: `Your one-time login code is ${otp}. It expires in 5 minutes.`,
    html: `<p>Your one-time login code is <b style="font-size:20px">${otp}</b>.</p><p>It expires in 5 minutes.</p>`,
  });

  const preview = nodemailer.getTestMessageUrl(info);
  if (preview) {
    console.log('[email] OTP preview URL:', preview);
  }
  return preview || null;
}

module.exports = { sendOtpEmail };
