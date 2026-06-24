// routes/auth.js
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
  if (!res.ok) throw new Error('Failed to authenticate with Gmail API')
  return data.access_token
}

function buildRawEmail({ from, to, subject, html }) {
  const encodedSubject  = `=?utf-8?B?${Buffer.from(subject, 'utf-8').toString('base64')}?=`
  const encodedFromName = `=?utf-8?B?${Buffer.from('CrickyWorld 🏏', 'utf-8').toString('base64')}?=`
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
  const accessToken = await getAccessToken()
  const raw = buildRawEmail({ from: process.env.GMAIL_USER, to, subject, html })
  const res = await fetch(GMAIL_SEND_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ raw }),
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data?.error?.message || 'Failed to send email')
  }
}

function signToken(userId) {
  return jwt.sign({ id: userId }, process.env.JWT_SECRET, { expiresIn: '90d' })
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
    const magicToken = crypto.randomBytes(32).toString('hex')

    const user = await User.create({
      name,
      email:      email.toLowerCase(),
      password:   hash,
      isVerified: false,
      loginToken: magicToken,
      loginTokenExpiry: new Date(Date.now() + 15 * 60 * 1000),
      ...(deviceId ? { deviceId } : {}),
    })

    const verifyUrl = `${process.env.SERVER_URL}/api/auth/magic/${magicToken}`
    const html = `
      <div style="font-family:sans-serif;max-width:480px;margin:auto;background:#0a0a0a;color:#f0f0f0;border-radius:16px;overflow:hidden">
        <div style="background:#cc0000;padding:24px;text-align:center">
          <h1 style="margin:0;font-size:28px">🏏 CrickyWorld</h1>
          <p style="margin:4px 0 0;opacity:0.8;font-size:13px">SCORE · TRACK · WIN</p>
        </div>
        <div style="padding:32px">
          <h2 style="color:#ff4444;margin-top:0">Hey ${user.name}! 👋</h2>
          <p style="color:#aaa">Tap the button below to verify your account and start scoring!</p>
          <div style="text-align:center;margin:32px 0">
            <a href="${verifyUrl}" style="background:#cc0000;color:#fff;padding:16px 40px;border-radius:12px;text-decoration:none;font-weight:800;font-size:16px">✅ Verify My Account</a>
          </div>
          <p style="color:#555;font-size:12px;text-align:center">This link expires in 15 minutes.</p>
        </div>
      </div>`
    await sendMail(user.email, 'Verify your CrickyWorld account', html)

    res.status(201).json({
      message: 'Account created! Check your email and click the verify button.',
      magicLink: true,
      email: user.email,
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

    const user = await User.findOne({ email: email.toLowerCase() }).select('+password')
    if (!user) return res.status(401).json({ message: 'No account found with this email' })

    const match = await bcrypt.compare(password, user.password)
    if (!match) return res.status(401).json({ message: 'Incorrect password' })

    const magicToken = crypto.randomBytes(32).toString('hex')
    await User.updateOne(
      { _id: user._id },
      { $set: { loginToken: magicToken, loginTokenExpiry: new Date(Date.now() + 15 * 60 * 1000) } }
    )

    const verifyUrl = `${process.env.SERVER_URL}/api/auth/magic/${magicToken}`
    const html = `
      <div style="font-family:sans-serif;max-width:480px;margin:auto;background:#0a0a0a;color:#f0f0f0;border-radius:16px;overflow:hidden">
        <div style="background:#cc0000;padding:24px;text-align:center">
          <h1 style="margin:0;font-size:28px">🏏 CrickyWorld</h1>
          <p style="margin:4px 0 0;opacity:0.8;font-size:13px">SCORE · TRACK · WIN</p>
        </div>
        <div style="padding:32px">
          <h2 style="color:#ff4444;margin-top:0">Confirm it's you, ${user.name}! 🔐</h2>
          <p style="color:#aaa">Tap the button below to sign in to CrickyWorld.</p>
          <div style="text-align:center;margin:32px 0">
            <a href="${verifyUrl}" style="background:#cc0000;color:#fff;padding:16px 40px;border-radius:12px;text-decoration:none;font-weight:800;font-size:16px">🏏 Sign In to CrickyWorld</a>
          </div>
          <p style="color:#555;font-size:12px;text-align:center">This link expires in 15 minutes. If you didn't request this, ignore this email.</p>
        </div>
      </div>`
    await sendMail(user.email, 'Your CrickyWorld sign-in link', html)
    console.log(`✅ Magic link sent to ${user.email}`)

   res.json({
  message: "Check your email and tap the sign-in button!",
  magicLink: true,
  email: user.email,
  loginToken: magicToken,  // ← ADD THIS
})
  } catch (err) {
    console.error('Login error:', err)
    res.status(500).json({ message: 'Server error' })
  }
})

// ── GET /api/auth/magic/:token ────────────────────────────────────────────────
// User clicks the link in email — this verifies them and shows success page
router.get('/magic/:token', async (req, res) => {
  try {
    const user = await User.findOne({
      loginToken: req.params.token,
      loginTokenExpiry: { $gt: new Date() },
    })

    if (!user) {
      return res.status(400).send(`
        <html><head><meta name="viewport" content="width=device-width,initial-scale=1">
        <style>body{font-family:sans-serif;background:#0a0a0a;color:#f0f0f0;display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0;padding:20px;box-sizing:border-box}
        .card{background:#161616;border-radius:22px;padding:40px;text-align:center;max-width:400px;width:100%}
        h1{color:#f87171}p{color:#666}</style></head>
        <body><div class="card"><h1>❌ Link Expired</h1><p>This sign-in link has expired or already been used. Please go back to the app and sign in again.</p></div></body></html>`)
    }

    // Mark as verified and clear token
    await User.updateOne(
      { _id: user._id },
     { $set: { isVerified: true, loginTokenConfirmed: true } }
    )

    const token = signToken(user._id)
    console.log(`✅ Magic link verified for ${user.email}`)

    // Show success page — app will detect login via polling
    res.send(`
      <html><head><meta name="viewport" content="width=device-width,initial-scale=1">
      <style>
        *{box-sizing:border-box;margin:0;padding:0}
        body{font-family:sans-serif;background:#0a0a0a;color:#f0f0f0;display:flex;justify-content:center;align-items:center;min-height:100vh;padding:20px}
        .card{background:#161616;border-radius:22px;border:1px solid rgba(255,255,255,0.07);padding:40px;text-align:center;max-width:400px;width:100%}
        .icon{font-size:64px;margin-bottom:16px}
        h1{color:#4ade80;font-size:24px;margin-bottom:12px}
        p{color:#666;line-height:1.6;margin-bottom:24px}
        .token{background:#0d0d0d;border:1px solid rgba(255,255,255,0.1);border-radius:12px;padding:16px;word-break:break-all;font-size:12px;color:#888;margin-bottom:24px;font-family:monospace}
        .btn{background:#cc0000;color:#fff;border:none;border-radius:12px;padding:14px 32px;font-size:15px;font-weight:800;cursor:pointer;width:100%;margin-bottom:8px}
        .sub{font-size:12px;color:#444;margin-top:16px}
      </style>
      </head>
      <body>
        <div class="card">
          <div class="icon">✅</div>
          <h1>You're signed in!</h1>
          <p>Go back to the CrickyWorld app and tap <strong style="color:#ff4444">"I've verified my email"</strong> to continue.</p>
          <div class="token">${token}</div>
          <p class="sub">Your secure token is shown above — the app uses it automatically.</p>
        </div>
      </body></html>`)
  } catch (err) {
    console.error('Magic link error:', err)
    res.status(500).send('Server error')
  }
})

// ── POST /api/auth/check-verified ─────────────────────────────────────────────
// App polls this after showing "waiting" screen — returns token when verified
router.post('/check-verified', async (req, res) => {
  try {
    const { email } = req.body
    if (!email) return res.status(400).json({ message: 'Email required' })

    const user = await User.findOne({ email: email.toLowerCase() })
    if (!user) return res.status(404).json({ message: 'User not found' })

    if (!user.isVerified || !user.loginTokenConfirmed) {
      return res.status(202).json({ verified: false, message: 'Not verified yet' })
    }

    const token = signToken(user._id)
    res.json({ verified: true, token, user: { _id: user._id, name: user.name, email: user.email } })
  } catch (err) {
    console.error('Check verified error:', err)
    res.status(500).json({ message: 'Server error' })
  }
})

// ── POST /api/auth/forgot-password ────────────────────────────────────────────
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body
    if (!email) return res.status(400).json({ message: 'Email is required' })
    const user = await User.findOne({ email: email.toLowerCase() })
    if (!user) return res.json({ message: 'If this email exists, a reset link has been sent.' })
    const resetToken = crypto.randomBytes(32).toString('hex')
    await User.updateOne({ _id: user._id }, { $set: { resetToken, resetTokenExpiry: new Date(Date.now() + 60 * 60 * 1000) } })
    const resetUrl = `${process.env.SERVER_URL}/api/auth/reset-password/${resetToken}`
    const html = `<div style="font-family:sans-serif;max-width:480px;margin:auto;background:#0a0a0a;color:#f0f0f0;border-radius:16px;overflow:hidden"><div style="background:#cc0000;padding:24px;text-align:center"><h1 style="margin:0">🏏 CrickyWorld</h1></div><div style="padding:32px"><h2 style="color:#ff4444">Hey ${user.name}! 👋</h2><p style="color:#aaa">Click below to reset your password.</p><div style="text-align:center;margin:32px 0"><a href="${resetUrl}" style="background:#cc0000;color:#fff;padding:14px 32px;border-radius:10px;text-decoration:none;font-weight:700">🔐 Reset My Password</a></div><p style="color:#555;font-size:12px;text-align:center">This link expires in 1 hour.</p></div></div>`
    await sendMail(email.toLowerCase(), 'Reset your CrickyWorld password', html)
    res.json({ message: 'If this email exists, a reset link has been sent.' })
  } catch (err) {
    console.error('Forgot password error:', err)
    res.status(500).json({ message: 'Server error' })
  }
})

// ── GET /api/auth/reset-password/:token ──────────────────────────────────────
router.get('/reset-password/:token', async (req, res) => {
  try {
    const user = await User.findOne({ resetToken: req.params.token, resetTokenExpiry: { $gt: new Date() } })
    if (!user) return res.status(400).send('<html><body style="font-family:sans-serif;text-align:center;padding:40px;background:#0a0a0a;color:#f0f0f0"><h1>❌ Invalid or expired link</h1></body></html>')
    res.send(`<html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:sans-serif;background:#0a0a0a;color:#f0f0f0;display:flex;justify-content:center;align-items:center;min-height:100vh;padding:20px}.card{background:#161616;border-radius:22px;border:1px solid rgba(255,255,255,0.07);overflow:hidden;width:100%;max-width:420px}.header{background:#cc0000;padding:24px;text-align:center}.header h1{font-size:24px;margin:0}.body{padding:28px;display:flex;flex-direction:column;gap:14px}label{font-size:11px;color:#666;font-weight:800;letter-spacing:1.5px}input{background:#0d0d0d;border:1.5px solid rgba(255,255,255,0.07);border-radius:13px;padding:14px 16px;color:#f0f0f0;font-size:15px;width:100%}button{background:#cc0000;color:#fff;border:none;border-radius:13px;padding:15px;font-size:14px;font-weight:800;cursor:pointer;width:100%}.msg{padding:12px;border-radius:10px;text-align:center;font-size:13px;font-weight:700;margin-bottom:8px}.success{background:rgba(74,222,128,0.1);border:1px solid rgba(74,222,128,0.25);color:#4ade80}.error{background:rgba(248,113,113,0.1);border:1px solid rgba(248,113,113,0.25);color:#f87171}</style></head><body><div class="card"><div class="header"><h1>🏏 Reset Password</h1></div><div class="body"><div id="msg"></div><label>NEW PASSWORD</label><input type="password" id="password" placeholder="Min 6 characters"/><label>CONFIRM PASSWORD</label><input type="password" id="confirm" placeholder="Repeat new password"/><button onclick="doReset()">🔐 Reset Password</button></div></div><script>async function doReset(){const p=document.getElementById('password').value,c=document.getElementById('confirm').value;if(p.length<6){showMsg('Min 6 chars',false);return}if(p!==c){showMsg('Passwords do not match',false);return}const r=await fetch(window.location.href,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:p})});const d=await r.json();showMsg(r.ok?'✅ Password reset! Open the app.':d.message||'Failed',r.ok)}function showMsg(t,s){const m=document.getElementById('msg');m.className='msg '+(s?'success':'error');m.textContent=t}</script></body></html>`)
  } catch (err) { res.status(500).send('Server error') }
})

// ── POST /api/auth/reset-password/:token ─────────────────────────────────────
router.post('/reset-password/:token', async (req, res) => {
  try {
    const { password } = req.body
    if (!password || password.length < 6)
      return res.status(400).json({ message: 'Password must be at least 6 characters' })
    const user = await User.findOne({ resetToken: req.params.token, resetTokenExpiry: { $gt: new Date() } }).select('+password')
    if (!user) return res.status(400).json({ message: 'Invalid or expired reset link' })
    await User.updateOne({ _id: user._id }, { $set: { password: await bcrypt.hash(password, 12) }, $unset: { resetToken: 1, resetTokenExpiry: 1 } })
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
    if (!user) return res.status(404).json({ message: 'Device not registered' })
    if (!user.isVerified) return res.status(403).json({ message: 'Email not verified' })
    res.json({ token: signToken(user._id), user: { _id: user._id, name: user.name, email: user.email } })
  } catch (err) { res.status(500).json({ message: 'Server error' }) }
})

// ── GET /api/auth/me ──────────────────────────────────────────────────────────
router.get('/me', async (req, res) => {
  try {
    const header = req.headers.authorization
    if (!header?.startsWith('Bearer '))
      return res.status(401).json({ message: 'No token provided' })
    const payload = jwt.verify(header.split(' ')[1], process.env.JWT_SECRET)
    const user    = await User.findById(payload.id)
    if (!user) return res.status(404).json({ message: 'User not found' })
    res.json({ _id: user._id, name: user.name, email: user.email })
  } catch { res.status(401).json({ message: 'Invalid or expired token' }) }
})
// ── GET /api/auth/login-status/:token ─────────────────────────────────────────
router.get('/login-status/:token', async (req, res) => {
  try {
    const { deviceId } = req.query
    const user = await User.findOne({ loginToken: req.params.token })

   if (!user) {
  return res.status(202).json({ confirmed: false, message: 'Waiting for link click' })
}

if (!user.loginTokenConfirmed) {
  return res.status(202).json({ confirmed: false, message: 'Waiting for link click' })
}

    // Link was clicked — issue JWT and clear loginToken fields
    await User.updateOne(
      { _id: user._id },
      {
        $unset: { loginToken: 1, loginTokenExpiry: 1, loginTokenConfirmed: 1 },
        ...(deviceId ? { $set: { deviceId: String(deviceId) } } : {}),
      }
    )

    console.log(`✅ Login status confirmed for ${user.email}`)
    const token = signToken(user._id)
    res.json({ confirmed: true, token, user: { _id: user._id, name: user.name, email: user.email } })
  } catch (err) {
    console.error('Login status error:', err)
    res.status(500).json({ message: 'Server error' })
  }
})

module.exports = router