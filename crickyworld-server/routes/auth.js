// crickyworld-server/routes/auth.js
const express = require('express')
const router  = express.Router()
const jwt     = require('jsonwebtoken')
const bcrypt  = require('bcryptjs')
const crypto  = require('crypto')
const User    = require('../models/User')

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const GMAIL_SEND_URL   = 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send'

async function getAccessToken() {
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id:     process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
      grant_type:    'refresh_token',
    }),
  })
  const data = await res.json()
  if (!res.ok) {
    console.error('Failed to refresh Google access token:', JSON.stringify(data))
    throw new Error('Failed to authenticate with Gmail API')
  }
  return data.access_token
}

function buildRawEmail({ from, to, subject, html }) {
  const encodedSubject  = `=?utf-8?B?${Buffer.from(subject, 'utf-8').toString('base64')}?=`
  const encodedFromName = `=?utf-8?B?${Buffer.from('CrickyWorld', 'utf-8').toString('base64')}?=`
  const message = [
    `From: ${encodedFromName} <${from}>`,
    `To: ${to}`,
    'Content-Type: text/html; charset=utf-8',
    'MIME-Version: 1.0',
    `Subject: ${encodedSubject}`,
    '',
    html,
  ].join('\n')
  return Buffer.from(message).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

async function sendMail(to, subject, html) {
  // Try Resend if configured
  if (process.env.RESEND_API_KEY) {
    try {
      console.log('Attempting to send email via Resend...')
      const { Resend } = require('resend')
      const resend = new Resend(process.env.RESEND_API_KEY)
      const fromEmail = process.env.FROM_EMAIL || 'onboarding@resend.dev'
      const data = await resend.emails.send({
        from: `CrickyWorld <${fromEmail}>`,
        to,
        subject,
        html,
      })
      console.log(`Email sent via Resend to ${to}: ${subject}`, data)
      return
    } catch (err) {
      console.error('Failed to send email via Resend, falling back...', err.message)
    }
  }

  // Try Nodemailer SMTP if GMAIL_USER and GMAIL_PASS are configured
  if (process.env.GMAIL_USER && process.env.GMAIL_PASS) {
    try {
      console.log('Attempting to send email via Nodemailer SMTP...')
      const nodemailer = require('nodemailer')
      const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
          user: process.env.GMAIL_USER,
          pass: process.env.GMAIL_PASS,
        },
      })
      await transporter.sendMail({
        from: `"CrickyWorld" <${process.env.GMAIL_USER}>`,
        to,
        subject,
        html,
      })
      console.log(`Email sent via Nodemailer SMTP to ${to}: ${subject}`)
      return
    } catch (err) {
      console.error('Failed to send email via Nodemailer SMTP, falling back...', err.message)
    }
  }

  // Fallback to Google OAuth/Gmail API
  try {
    console.log('Attempting to send email via Gmail API OAuth...')
    const accessToken = await getAccessToken()
    const raw = buildRawEmail({ from: process.env.GMAIL_USER, to, subject, html })
    const res = await fetch(GMAIL_SEND_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ raw }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      console.error(`Failed to send email to ${to}:`, JSON.stringify(data))
      throw new Error(data?.error?.message || 'Failed to send email')
    }
    console.log(`Email sent via Gmail API OAuth to ${to}: ${subject}`)
  } catch (err) {
    console.error(`Failed to send email to ${to}:`, err.message)
    throw err
  }
}

function signToken(userId) {
  return jwt.sign({ id: userId }, process.env.JWT_SECRET, { expiresIn: '90d' })
}

function generateLoginToken() {
  return crypto.randomBytes(32).toString('hex')
}

async function sendVerifyLinkEmail(email, name, token, purpose, serverUrl) {
  const isLogin   = purpose === 'login'
  const subject   = isLogin ? "Confirm it's you on CrickyWorld" : 'Verify your CrickyWorld account'
  const heading   = isLogin ? `Confirm it's you, ${name}!` : `Hey ${name}!`
  const intro     = isLogin
    ? 'Tap the button below on this device to finish signing in to CrickyWorld.'
    : 'Thanks for joining CrickyWorld! Tap the button below to verify your email and activate your account.'
  const baseUrl    = serverUrl || process.env.SERVER_URL || 'https://crickyworld-appserver.onrender.com'
  const confirmUrl = `${baseUrl}/api/auth/confirm-link/${token}`

  console.log(`Building verify link for ${email}: ${confirmUrl}`)

  const html = `
    <div style="font-family:sans-serif;max-width:480px;margin:auto;background:#0a0a0a;color:#f0f0f0;border-radius:16px;overflow:hidden">
      <div style="background:#cc0000;padding:24px;text-align:center">
        <h1 style="margin:0;font-size:28px">CrickyWorld</h1>
        <p style="margin:4px 0 0;opacity:0.8;font-size:13px">SCORE TRACK WIN</p>
      </div>
      <div style="padding:32px">
        <h2 style="color:#ff4444;margin-top:0">${heading}</h2>
        <p style="color:#aaa;line-height:1.6">${intro}</p>
        <div style="text-align:center;margin:32px 0">
          <a href="${confirmUrl}" style="background:#cc0000;color:#fff;padding:14px 32px;border-radius:10px;text-decoration:none;font-weight:700;font-size:15px;display:inline-block">
            Verify it's you
          </a>
        </div>
        <p style="color:#555;font-size:12px;text-align:center">This link expires in 10 minutes. Never share it with anyone.</p>
      </div>
    </div>
  `
  await sendMail(email, subject, html)
}

async function sendResetEmail(email, name, token, serverUrl) {
  const baseUrl  = serverUrl || process.env.SERVER_URL || 'https://crickyworld-appserver.onrender.com'
  const resetUrl = `${baseUrl}/api/auth/reset-password/${token}`
  const html = `
    <div style="font-family:sans-serif;max-width:480px;margin:auto;background:#0a0a0a;color:#f0f0f0;border-radius:16px;overflow:hidden">
      <div style="background:#cc0000;padding:24px;text-align:center">
        <h1 style="margin:0;font-size:28px">CrickyWorld</h1>
        <p style="margin:4px 0 0;opacity:0.8;font-size:13px">SCORE TRACK WIN</p>
      </div>
      <div style="padding:32px">
        <h2 style="color:#ff4444;margin-top:0">Hey ${name}!</h2>
        <p style="color:#aaa;line-height:1.6">We received a request to reset your CrickyWorld password. Click below to set a new password.</p>
        <div style="text-align:center;margin:32px 0">
          <a href="${resetUrl}" style="background:#cc0000;color:#fff;padding:14px 32px;border-radius:10px;text-decoration:none;font-weight:700;font-size:15px">
            Reset My Password
          </a>
        </div>
        <p style="color:#555;font-size:12px;text-align:center">This link expires in 1 hour. If you did not request this, ignore this email.</p>
      </div>
    </div>
  `
  await sendMail(email, 'Reset your CrickyWorld password', html)
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

    const hash  = await bcrypt.hash(password, 12)
    const token = generateLoginToken()

    const user = await User.create({
      name,
      email:               email.toLowerCase(),
      password:            hash,
      ...(deviceId ? { deviceId } : {}),
      isVerified:          false,
      loginToken:          token,
      loginTokenExpiry:    new Date(Date.now() + 10 * 60 * 1000),
      loginTokenPurpose:   'register',
      loginTokenConfirmed: false,
    })

    console.log(`New user registered: ${user.email}, sending verify link...`)
    const serverUrl = process.env.SERVER_URL || `${req.protocol}://${req.get('host')}`
    await sendVerifyLinkEmail(user.email, user.name, token, 'register', serverUrl)

    res.status(201).json({
      message:        'Account created! Check your email and tap the verify link to activate it.',
      verifyRequired: true,
      purpose:        'register',
      email:          user.email,
      loginToken:     token,
    })
  } catch (err) {
    console.error('Register error:', err)
    res.status(500).json({ message: 'Server error' })
  }
})

// ── POST /api/auth/login ──────────────────────────────────────────────────────
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body
    if (!email || !password)
      return res.status(400).json({ message: 'Email and password are required' })

    // FIX 1: select loginToken + loginTokenExpiry so the double-submit guard
    // can actually read them (both have select:false in the User schema).
    const user = await User.findOne({ email: email.toLowerCase() })
      .select('+password +loginToken +loginTokenExpiry')
    if (!user) return res.status(401).json({ message: 'No account found with this email' })

    const match = await bcrypt.compare(password, user.password)
    if (!match) return res.status(401).json({ message: 'Incorrect password' })

    const purpose = user.isVerified ? 'login' : 'register'
    const now     = Date.now()

    // FIX 2: If a fresh token already exists (issued < 30s ago, so > 9.5 min
    // remaining on a 10-min expiry) reuse it instead of overwriting. Without
    // this, a double-tap or a back-and-retry generates a second token that
    // overwrites the first, making every subsequent poll return 410.
    const tokenStillFresh =
      user.loginToken &&
      user.loginTokenExpiry &&
      user.loginTokenExpiry.getTime() > now + 9.5 * 60 * 1000

    if (tokenStillFresh) {
      console.log(`[login] reusing fresh token for ${user.email}`)
      return res.json({
        message:        purpose === 'login'
          ? "We sent a link to your email to confirm it's you."
          : 'Please verify your email first. We sent you a new verify link.',
        verifyRequired: true,
        purpose,
        email:          user.email,
        loginToken:     user.loginToken,
      })
    }

    const token = generateLoginToken()
    user.loginToken          = token
    user.loginTokenExpiry    = new Date(now + 10 * 60 * 1000)
    user.loginTokenPurpose   = purpose
    user.loginTokenConfirmed = false
    await user.save()

    console.log(`[login] new token for ${user.email}, purpose=${purpose}, token=${token.slice(0, 8)}...`)
    const serverUrl = process.env.SERVER_URL || `${req.protocol}://${req.get('host')}`
    await sendVerifyLinkEmail(user.email, user.name, token, purpose, serverUrl)
    console.log(`[login] email sent to ${user.email}`)

    res.json({
      message:        purpose === 'login'
        ? "We sent a link to your email to confirm it's you."
        : 'Please verify your email first. We sent you a new verify link.',
      verifyRequired: true,
      purpose,
      email:          user.email,
      loginToken:     token,
    })
  } catch (err) {
    console.error('Login error:', err)
    res.status(500).json({ message: 'Server error' })
  }
})

// ── GET /api/auth/login-status/:token ────────────────────────────────────────
// Polled by the app every few seconds while the user checks their email.
router.get('/login-status/:token', async (req, res) => {
  try {
    const { deviceId } = req.query
    const user = await User.findOne({ loginToken: req.params.token })

    if (!user) {
      console.log(`[login-status] no user for token ${req.params.token.slice(0, 8)}...`)
      // FIX 3: return 410 (not 404) so the client treats this as terminal
      // and shows an error instead of polling forever.
      return res.status(410).json({ confirmed: false, message: 'Link expired. Please resend.' })
    }

    if (!user.loginTokenExpiry || user.loginTokenExpiry < new Date()) {
      console.log(`[login-status] token expired for ${user.email}`)
      return res.status(410).json({ confirmed: false, expired: true, message: 'Link expired. Please resend.' })
    }

    if (!user.loginTokenConfirmed) {
      return res.json({ confirmed: false })
    }

    const purpose = user.loginTokenPurpose
    if (purpose === 'register') user.isVerified = true
    if (deviceId) user.deviceId = String(deviceId)
    user.loginToken          = undefined
    user.loginTokenExpiry    = undefined
    user.loginTokenPurpose   = undefined
    user.loginTokenConfirmed = false
    await user.save()

    console.log(`[login-status] confirmed for ${user.email}, issuing JWT`)
    const jwtToken = signToken(user._id)
    res.json({
      confirmed: true,
      token:     jwtToken,
      user:      { _id: user._id, name: user.name, email: user.email },
    })
  } catch (err) {
    console.error('Login status error:', err)
    res.status(500).json({ message: 'Server error' })
  }
})

// ── GET /api/auth/confirm-link/:token ────────────────────────────────────────
// Opened by tapping the button in the email — runs in the phone's browser.
router.get('/confirm-link/:token', async (req, res) => {
  try {
    const user = await User.findOne({ loginToken: req.params.token })
    const fail = (text) => res.status(400).send(`
      <html><body style="font-family:sans-serif;text-align:center;padding:40px;background:#0a0a0a;color:#f0f0f0">
        <h1>${text}</h1><p>Please go back to the app and try again.</p>
      </body></html>`)

    if (!user) {
      console.log(`[confirm-link] no user for token ${req.params.token.slice(0, 8)}...`)
      return fail('Invalid or expired link')
    }
    if (!user.loginTokenExpiry || user.loginTokenExpiry < new Date()) {
      console.log(`[confirm-link] token expired for ${user.email}`)
      return fail('Link expired')
    }

    user.loginTokenConfirmed = true
    await user.save()
    console.log(`[confirm-link] confirmed for ${user.email}`)

    res.send(`
      <html><body style="font-family:sans-serif;text-align:center;padding:40px;background:#0a0a0a;color:#f0f0f0">
        <h1 style="color:#ff4444">You're verified!</h1>
        <p style="color:#aaa">Go back to the CrickyWorld app — it will log you in automatically.</p>
      </body></html>`)
  } catch (err) {
    console.error('Confirm link error:', err)
    res.status(500).send('Server error')
  }
})

// ── POST /api/auth/resend-link ────────────────────────────────────────────────
router.post('/resend-link', async (req, res) => {
  try {
    const { email, purpose } = req.body
    if (!email || !purpose)
      return res.status(400).json({ message: 'Email and purpose are required' })

    const user = await User.findOne({ email: email.toLowerCase() })
    if (!user)
      return res.status(404).json({ message: 'No account found with this email' })
    if (purpose === 'register' && user.isVerified)
      return res.status(400).json({ message: 'Email already verified' })

    const token = generateLoginToken()
    user.loginToken          = token
    user.loginTokenExpiry    = new Date(Date.now() + 10 * 60 * 1000)
    user.loginTokenPurpose   = purpose
    user.loginTokenConfirmed = false
    await user.save()

    console.log(`[resend-link] sending to ${user.email}, purpose=${purpose}`)
    const serverUrl = process.env.SERVER_URL || `${req.protocol}://${req.get('host')}`
    await sendVerifyLinkEmail(user.email, user.name, token, purpose, serverUrl)
    res.json({ message: 'A new link has been sent to your email.', loginToken: token })
  } catch (err) {
    console.error('Resend link error:', err)
    res.status(500).json({ message: 'Server error' })
  }
})

// ── POST /api/auth/forgot-password ───────────────────────────────────────────
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

    const serverUrl = process.env.SERVER_URL || `${req.protocol}://${req.get('host')}`
    await sendResetEmail(email.toLowerCase(), user.name, resetToken, serverUrl)
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
      resetToken:       req.params.token,
      resetTokenExpiry: { $gt: new Date() },
    })
    if (!user) return res.status(400).send(`
      <html><body style="font-family:sans-serif;text-align:center;padding:40px;background:#0a0a0a;color:#f0f0f0">
        <h1>Invalid or expired link</h1><p>Please request a new password reset.</p>
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
          <div class="header"><h1>Reset Password</h1></div>
          <div class="body">
            <div id="msg"></div>
            <label>NEW PASSWORD</label>
            <input type="password" id="password" placeholder="Min 6 characters" />
            <label>CONFIRM PASSWORD</label>
            <input type="password" id="confirm" placeholder="Repeat new password" />
            <button onclick="doReset()">Reset Password</button>
          </div>
        </div>
        <script>
          async function doReset() {
            const p = document.getElementById('password').value
            const c = document.getElementById('confirm').value
            if (p.length < 6) { showMsg('Password must be at least 6 characters', false); return }
            if (p !== c)      { showMsg('Passwords do not match', false); return }
            const res  = await fetch(window.location.href, {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ password: p })
            })
            const data = await res.json()
            if (res.ok) showMsg('Password reset! Open CrickyWorld app and sign in.', true)
            else        showMsg(data.message || 'Failed to reset password', false)
          }
          function showMsg(text, success) {
            const m = document.getElementById('msg')
            m.className  = 'msg ' + (success ? 'success' : 'error')
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
      resetToken:       req.params.token,
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
router.post('/device-login', async (req, res) => {
  try {
    const { deviceId } = req.body
    if (!deviceId) return res.status(400).json({ message: 'deviceId required' })
    const user = await User.findOne({ deviceId })
    if (!user)           return res.status(404).json({ message: 'Device not registered' })
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
```
