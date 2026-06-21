// crickyworld-server/routes/auth.js
const express = require('express')
const router  = express.Router()
const jwt     = require('jsonwebtoken')
const bcrypt  = require('bcryptjs')
const crypto  = require('crypto')
const User    = require('../models/User')
const nodemailer = require('nodemailer')

const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 587,
  secure: false,
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_PASS,
  },
  family: 4,
})

function signToken(userId) {
  return jwt.sign({ id: userId }, process.env.JWT_SECRET, { expiresIn: '90d' })
}

// 6-digit code, true uniform 000000–999999 (crypto.randomInt, not Math.random)
function generateOtp() {
  return crypto.randomInt(0, 1000000).toString().padStart(6, '0')
}

// ── OTP email ──────────────────────────────────────────────────────────────
// `to: email` is already dynamic here — this function has always sent to
// whatever address is passed in. If real-world delivery only reaches your
// own inbox, the cause is almost certainly NOT this code — see the note in
// chat about App Passwords / spam folders / Render logs.
async function sendOtpEmail(email, name, otp, purpose) {
  const isLogin  = purpose === 'login'
  const subject  = isLogin ? 'Your CrickyWorld sign-in code' : 'Verify your CrickyWorld account'
  const heading  = isLogin ? `Confirm it's you, ${name}! 🔐` : `Hey ${name}! 👋`
  const intro    = isLogin
    ? 'Use this code to finish signing in to CrickyWorld.'
    : 'Thanks for joining CrickyWorld! Use this code to verify your email and activate your account.'

  try {
    await transporter.sendMail({
      from: `"CrickyWorld 🏏" <${process.env.GMAIL_USER}>`,
      to: email,
      subject,
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:auto;background:#0a0a0a;color:#f0f0f0;border-radius:16px;overflow:hidden">
          <div style="background:#cc0000;padding:24px;text-align:center">
            <h1 style="margin:0;font-size:28px">🏏 CrickyWorld</h1>
            <p style="margin:4px 0 0;opacity:0.8;font-size:13px">SCORE · TRACK · WIN</p>
          </div>
          <div style="padding:32px">
            <h2 style="color:#ff4444;margin-top:0">${heading}</h2>
            <p style="color:#aaa;line-height:1.6">${intro}</p>
            <div style="text-align:center;margin:32px 0">
              <div style="display:inline-block;background:#161616;border:1.5px solid rgba(255,255,255,0.1);border-radius:14px;padding:20px 36px">
                <span style="font-size:36px;font-weight:800;letter-spacing:10px;color:#fff">${otp}</span>
              </div>
            </div>
            <p style="color:#555;font-size:12px;text-align:center">This code expires in 10 minutes. Never share it with anyone.</p>
          </div>
        </div>
      `,
    })
  } catch (err) {
    console.error(`Failed to send OTP email to ${email}:`, err.message)
    throw err
  }
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
          <p style="color:#aaa;line-height:1.6">We received a request to reset your CrickyWorld password. Click below to set a new password.</p>
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

// ── POST /api/auth/register ───────────────────────────────────────────────────
router.post('/register', async (req, res) => {
  try {
    const { name, email, password, deviceId } = req.body
    if (!name || !email || !password)
      return res.status(400).json({ message: 'Name, email and password are required' })

    const existing = await User.findOne({ email: email.toLowerCase() })
    if (existing)
      return res.status(409).json({ message: 'An account with this email already exists' })

    const hash = await bcrypt.hash(password, 12)
    const otp  = generateOtp()

    const user = await User.create({
      name,
      email: email.toLowerCase(),
      password: hash,
      deviceId: deviceId || null,
      isVerified: false,
      otpHash: await bcrypt.hash(otp, 10),
      otpExpiry: new Date(Date.now() + 10 * 60 * 1000),
      otpPurpose: 'register',
      otpAttempts: 0,
    })

    await sendOtpEmail(user.email, user.name, otp, 'register')
    res.status(201).json({
      message: 'Account created! Enter the code we emailed you to verify.',
      otpRequired: true,
      purpose: 'register',
      email: user.email,
    })
  } catch (err) {
    console.error('Register error:', err)
    res.status(500).json({ message: 'Server error' })
  }
})

// ── POST /api/auth/login ──────────────────────────────────────────────────────
// Always issues an OTP instead of a token directly — token is only issued
// after /verify-otp succeeds. Unverified accounts get a 'register' purpose
// code (so the same screen can finish account verification); verified
// accounts get a 'login' purpose code (2FA).
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body
    if (!email || !password)
      return res.status(400).json({ message: 'Email and password are required' })

    const user = await User.findOne({ email: email.toLowerCase() }).select('+password')
    if (!user) return res.status(401).json({ message: 'No account found with this email' })

    const match = await bcrypt.compare(password, user.password)
    if (!match) return res.status(401).json({ message: 'Incorrect password' })

    const purpose = user.isVerified ? 'login' : 'register'
    const otp = generateOtp()
    user.otpHash     = await bcrypt.hash(otp, 10)
    user.otpExpiry   = new Date(Date.now() + 10 * 60 * 1000)
    user.otpPurpose  = purpose
    user.otpAttempts = 0
    await user.save()

    await sendOtpEmail(user.email, user.name, otp, purpose)
    res.json({
      message: purpose === 'login'
        ? "We sent a code to your email to confirm it's you."
        : 'Please verify your email first. We sent you a new code.',
      otpRequired: true,
      purpose,
      email: user.email,
    })
  } catch (err) {
    console.error('Login error:', err)
    res.status(500).json({ message: 'Server error' })
  }
})

// ── POST /api/auth/verify-otp ─────────────────────────────────────────────────
// Shared by both register-verification and login-2FA. Returns a token on success.
router.post('/verify-otp', async (req, res) => {
  try {
    const { email, otp, purpose, deviceId } = req.body
    if (!email || !otp || !purpose)
      return res.status(400).json({ message: 'Email, code and purpose are required' })

    const user = await User.findOne({ email: email.toLowerCase() }).select('+otpHash')
    if (!user) return res.status(404).json({ message: 'No account found with this email' })

    if (!user.otpHash || !user.otpExpiry || user.otpPurpose !== purpose) {
      return res.status(400).json({ message: 'No active code for this request. Please resend.' })
    }

    if (user.otpExpiry < new Date()) {
      user.otpHash = undefined; user.otpExpiry = undefined; user.otpPurpose = undefined; user.otpAttempts = 0
      await user.save()
      return res.status(400).json({ message: 'Code expired. Please resend a new one.' })
    }

    if (user.otpAttempts >= 5) {
      user.otpHash = undefined; user.otpExpiry = undefined; user.otpPurpose = undefined; user.otpAttempts = 0
      await user.save()
      return res.status(429).json({ message: 'Too many incorrect attempts. Please resend a new code.' })
    }

    const match = await bcrypt.compare(String(otp), user.otpHash)
    if (!match) {
      user.otpAttempts += 1
      await user.save()
      return res.status(400).json({ message: `Incorrect code. ${5 - user.otpAttempts} attempt(s) left.` })
    }

    if (purpose === 'register') user.isVerified = true
    user.otpHash = undefined; user.otpExpiry = undefined; user.otpPurpose = undefined; user.otpAttempts = 0
    if (deviceId) user.deviceId = deviceId
    await user.save()

    const token = signToken(user._id)
    res.json({ token, user: { _id: user._id, name: user.name, email: user.email } })
  } catch (err) {
    console.error('Verify OTP error:', err)
    res.status(500).json({ message: 'Server error' })
  }
})

// ── POST /api/auth/resend-otp ─────────────────────────────────────────────────
router.post('/resend-otp', async (req, res) => {
  try {
    const { email, purpose } = req.body
    if (!email || !purpose) return res.status(400).json({ message: 'Email and purpose are required' })

    const user = await User.findOne({ email: email.toLowerCase() })
    if (!user) return res.status(404).json({ message: 'No account found with this email' })
    if (purpose === 'register' && user.isVerified)
      return res.status(400).json({ message: 'Email already verified' })

    const otp = generateOtp()
    user.otpHash     = await bcrypt.hash(otp, 10)
    user.otpExpiry   = new Date(Date.now() + 10 * 60 * 1000)
    user.otpPurpose  = purpose
    user.otpAttempts = 0
    await user.save()

    await sendOtpEmail(user.email, user.name, otp, purpose)
    res.json({ message: 'A new code has been sent to your email.' })
  } catch (err) {
    console.error('Resend OTP error:', err)
    res.status(500).json({ message: 'Server error' })
  }
})

// ── POST /api/auth/forgot-password ────────────────────────────────────────────
// Unchanged — still a link-based flow, separate from OTP login/verify.
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body
    if (!email) return res.status(400).json({ message: 'Email is required' })

    const user = await User.findOne({ email: email.toLowerCase() })
    if (!user) return res.json({ message: 'If this email exists, a reset link has been sent.' })

    const resetToken = crypto.randomBytes(32).toString('hex')
    user.resetToken       = resetToken
    user.resetTokenExpiry = new Date(Date.now() + 60 * 60 * 1000)
    await user.save()

    await sendResetEmail(email.toLowerCase(), user.name, resetToken)
    res.json({ message: 'If this email exists, a reset link has been sent.' })
  } catch (err) {
    console.error('Forgot password error:', err)
    res.status(500).json({ message: 'Server error' })
  }
})

// ── GET /api/auth/reset-password/:token ──────────────────────────────────────
router.get('/reset-password/:token', async (req, res) => {
  try {
    const user = await User.findOne({
      resetToken: req.params.token,
      resetTokenExpiry: { $gt: new Date() },
    })
    if (!user) return res.status(400).send(`
      <html><body style="font-family:sans-serif;text-align:center;padding:40px;background:#0a0a0a;color:#f0f0f0">
        <h1>❌ Invalid or expired link</h1><p>Please request a new password reset.</p>
      </body></html>`)

    res.send(`
      <html>
      <head><meta name="viewport" content="width=device-width,initial-scale=1">
      <style>
        *{box-sizing:border-box;margin:0;padding:0}
        body{font-family:sans-serif;background:#0a0a0a;color:#f0f0f0;display:flex;justify-content:center;align-items:center;min-height:100vh;padding:20px}
        .card{background:#161616;border-radius:22px;border:1px solid rgba(255,255,255,0.07);overflow:hidden;width:100%;max-width:420px}
        .header{background:#cc0000;padding:24px;text-align:center}
        .header h1{font-size:24px;margin:0}
        .body{padding:28px;display:flex;flex-direction:column;gap:14px}
        label{font-size:11px;color:#666;font-weight:800;letter-spacing:1.5px}
        input{background:#0d0d0d;border:1.5px solid rgba(255,255,255,0.07);border-radius:13px;padding:14px 16px;color:#f0f0f0;font-size:15px;width:100%}
        button{background:#cc0000;color:#fff;border:none;border-radius:13px;padding:15px;font-size:14px;font-weight:800;cursor:pointer;width:100%}
        button:hover{background:#aa0000}
        .msg{padding:12px;border-radius:10px;text-align:center;font-size:13px;font-weight:700;margin-bottom:8px}
        .success{background:rgba(74,222,128,0.1);border:1px solid rgba(74,222,128,0.25);color:#4ade80}
        .error{background:rgba(248,113,113,0.1);border:1px solid rgba(248,113,113,0.25);color:#f87171}
      </style>
      </head>
      <body>
        <div class="card">
          <div class="header"><h1>🏏 Reset Password</h1></div>
          <div class="body">
            <div id="msg"></div>
            <label>NEW PASSWORD</label>
            <input type="password" id="password" placeholder="Min 6 characters" />
            <label>CONFIRM PASSWORD</label>
            <input type="password" id="confirm" placeholder="Repeat new password" />
            <button onclick="doReset()">🔐 Reset Password</button>
          </div>
        </div>
        <script>
          async function doReset() {
            const p = document.getElementById('password').value
            const c = document.getElementById('confirm').value
            if (p.length < 6) { showMsg('Password must be at least 6 characters', false); return }
            if (p !== c) { showMsg('Passwords do not match', false); return }
            const res = await fetch(window.location.href, {
              method: 'POST', headers: {'Content-Type':'application/json'},
              body: JSON.stringify({ password: p })
            })
            const data = await res.json()
            if (res.ok) { showMsg('✅ Password reset! Open CrickyWorld app and sign in.', true) }
            else { showMsg(data.message || 'Failed to reset password', false) }
          }
          function showMsg(text, success) {
            const m = document.getElementById('msg')
            m.className = 'msg ' + (success ? 'success' : 'error')
            m.textContent = text
          }
        </script>
      </body></html>
    `)
  } catch (err) {
    res.status(500).send('Server error')
  }
})

// ── POST /api/auth/reset-password/:token ─────────────────────────────────────
router.post('/reset-password/:token', async (req, res) => {
  try {
    const { password } = req.body
    if (!password || password.length < 6)
      return res.status(400).json({ message: 'Password must be at least 6 characters' })

    const user = await User.findOne({
      resetToken: req.params.token,
      resetTokenExpiry: { $gt: new Date() },
    }).select('+password')
    if (!user) return res.status(400).json({ message: 'Invalid or expired reset link' })

    user.password         = await bcrypt.hash(password, 12)
    user.resetToken       = undefined
    user.resetTokenExpiry = undefined
    await user.save()

    res.json({ message: 'Password reset successfully!' })
  } catch (err) {
    console.error('Reset error:', err)
    res.status(500).json({ message: 'Server error' })
  }
})

// ── POST /api/auth/device-login ───────────────────────────────────────────────
// Unchanged — this is the silent re-login used on app launch for a device
// that already has a verified session. It intentionally does NOT trigger OTP,
// otherwise the app would demand a code every time it's opened.
router.post('/device-login', async (req, res) => {
  try {
    const { deviceId } = req.body
    if (!deviceId) return res.status(400).json({ message: 'deviceId required' })
    const user = await User.findOne({ deviceId })
    if (!user) return res.status(404).json({ message: 'Device not registered' })
    if (!user.isVerified) return res.status(403).json({ message: 'Email not verified' })
    const token = signToken(user._id)
    res.json({ token, user: { _id: user._id, name: user.name, email: user.email } })
  } catch (err) {
    res.status(500).json({ message: 'Server error' })
  }
})

// ── GET /api/auth/me ──────────────────────────────────────────────────────────
router.get('/me', async (req, res) => {
  try {
    const header = req.headers.authorization
    if (!header || !header.startsWith('Bearer '))
      return res.status(401).json({ message: 'No token provided' })
    const payload = jwt.verify(header.split(' ')[1], process.env.JWT_SECRET)
    const user    = await User.findById(payload.id)
    if (!user) return res.status(404).json({ message: 'User not found' })
    res.json({ _id: user._id, name: user.name, email: user.email })
  } catch {
    res.status(401).json({ message: 'Invalid or expired token' })
  }
})

module.exports = router