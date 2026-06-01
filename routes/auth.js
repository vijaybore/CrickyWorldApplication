const nodemailer = require('nodemailer')

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_PASS,
  }
})

async function sendVerificationEmail(email, name, token) {
  const verifyUrl = `${process.env.SERVER_URL}/api/auth/verify-email/${token}`
  await transporter.sendMail({
    from: `"CrickyWorld 🏏" <${process.env.GMAIL_USER}>`,
    to: email,
    subject: 'Verify your CrickyWorld account',
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:auto;background:#0a0a0a;color:#f0f0f0;border-radius:16px;overflow:hidden">
        <div style="background:#cc0000;padding:24px;text-align:center">
          <h1 style="margin:0;font-size:28px">🏏 CrickyWorld</h1>
          <p style="margin:4px 0 0;opacity:0.8;font-size:13px">SCORE · TRACK · WIN</p>
        </div>
        <div style="padding:32px">
          <h2 style="color:#ff4444;margin-top:0">Hey ${name}! 👋</h2>
          <p style="color:#aaa;line-height:1.6">Thanks for joining CrickyWorld! Please verify your email to activate your account.</p>
          <div style="text-align:center;margin:32px 0">
            <a href="${verifyUrl}" style="background:#cc0000;color:#fff;padding:14px 32px;border-radius:10px;text-decoration:none;font-weight:700;font-size:15px">
              ✅ Verify My Email
            </a>
          </div>
          <p style="color:#555;font-size:12px;text-align:center">This link expires in 24 hours.</p>
        </div>
      </div>
    `
  })
}

async function sendResetEmail(email, name, token) {
  const resetUrl = `${process.env.SERVER_URL}/api/auth/reset-password/${token}`
  await transporter.sendMail({
    from: `"CrickyWorld 🏏" <${process.env.GMAIL_USER}>`,
    to: email,
    subject: 'Reset your CrickyWorld password',
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:auto;background:#0a0a0a;color:#f0f0f0;border-radius:16px;overflow:hidden">
        <div style="background:#cc0000;padding:24px;text-align:center">
          <h1 style="margin:0;font-size:28px">🏏 CrickyWorld</h1>
          <p style="margin:4px 0 0;opacity:0.8;font-size:13px">SCORE · TRACK · WIN</p>
        </div>
        <div style="padding:32px">
          <h2 style="color:#ff4444;margin-top:0">Hey ${name}! 👋</h2>
          <p style="color:#aaa;line-height:1.6">We received a request to reset your password. Click below to set a new one.</p>
          <div style="text-align:center;margin:32px 0">
            <a href="${resetUrl}" style="background:#cc0000;color:#fff;padding:14px 32px;border-radius:10px;text-decoration:none;font-weight:700;font-size:15px">
              🔐 Reset My Password
            </a>
          </div>
          <p style="color:#555;font-size:12px;text-align:center">This link expires in 1 hour. If you didn't request this, ignore this email.</p>
        </div>
      </div>
    `
  })
}