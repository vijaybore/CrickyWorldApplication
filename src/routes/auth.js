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

function generateOtp() {
  return crypto.randomInt(0, 1000000).toString().padStart(6, '0')
}

async function sendOtpEmail(email, name, otp, purpose) {
  const isLogin = purpose === 'login'
  const subject = isLogin ? 'Your CrickyWorld sign-in code' : 'Verify your CrickyWorld account'
  const heading = isLogin ? `Confirm it's you, ${name}! 🔐` : `Hey ${name}! 👋`
  const intro   = isLogin
    ? 'Use this code to finish signing in to CrickyWorld.'
    : 'Thanks for joining CrickyWorld! Use this code to verify your email.'
  const html = `
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
    </div>`
  await sendMail(email, subject, html)
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
      email:       email.toLowerCase(),
      password:    hash,
      isVerified:  false,
      otpHash:     await bcrypt.hash(otp, 10),
      otpExpiry:   new Date(Date.now() + 10 * 60 * 1000),
      otpPurpose:  'register',
      otpAttempts: 0,
      ...(deviceId ? { deviceId } : {}),
    })

    await sendOtpEmail(user.email, user.name, otp, 'register')
    res.status(201).json({
      message: 'Account created! Enter the code we emailed you to verify.',
      otpRequired: true, purpose: 'register', email: user.email,
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

    const purpose = user.isVerified ? 'login' : 'register'
    const otp     = generateOtp()

    // Use updateOne to avoid select:false issues with save()
    await User.updateOne(
      { _id: user._id },
      { $set: { otpHash: await bcrypt.hash(otp, 10), otpExpiry: new Date(Date.now() + 10 * 60 * 1000), otpPurpose: purpose, otpAttempts: 0 } }
    )

    await sendOtpEmail(user.email, user.name, otp, purpose)
    console.log(`✅ OTP sent to ${user.email} | purpose: ${purpose}`)

    res.json({
      message: purpose === 'login' ? "We sent a code to your email." : 'Please verify your email. We sent you a new code.',
      otpRequired: true, purpose, email: user.email,
    })
  } catch (err) {
    console.error('Login error:', err)
    res.status(500).json({ message: 'Server error' })
  }
})

// ── POST /api/auth/verify-otp ─────────────────────────────────────────────────
router.post('/verify-otp', async (req, res) => {
  try {
    const { email, otp, purpose, deviceId } = req.body
    if (!email || !otp || !purpose)
      return res.status(400).json({ message: 'Email, code and purpose are required' })

    // Use lean() to get raw document — bypasses all select:false restrictions
    const user = await User.findOne({ email: email.toLowerCase() })
      .select('+otpHash +password')
      .lean()

    if (!user) return res.status(404).json({ message: 'No account found with this email' })

    console.log('🔍 verify-otp:', {
      email: email.toLowerCase(),
      purpose,
      hasOtpHash:   !!user.otpHash,
      hasOtpExpiry: !!user.otpExpiry,
      otpPurpose:   user.otpPurpose,
      match:        user.otpPurpose === purpose,
    })

    if (!user.otpHash || !user.otpExpiry || user.otpPurpose !== purpose) {
      return res.status(400).json({ message: 'No active code for this request. Please resend.' })
    }

    if (new Date(user.otpExpiry) < new Date()) {
      await User.updateOne({ _id: user._id }, { $unset: { otpHash: 1, otpExpiry: 1, otpPurpose: 1 }, $set: { otpAttempts: 0 } })
      return res.status(400).json({ message: 'Code expired. Please resend a new one.' })
    }

    if (user.otpAttempts >= 5) {
      await User.updateOne({ _id: user._id }, { $unset: { otpHash: 1, otpExpiry: 1, otpPurpose: 1 }, $set: { otpAttempts: 0 } })
      return res.status(429).json({ message: 'Too many attempts. Please resend.' })
    }

    const otpMatch = await bcrypt.compare(String(otp), user.otpHash)
    if (!otpMatch) {
      await User.updateOne({ _id: user._id }, { $inc: { otpAttempts: 1 } })
      return res.status(400).json({ message: `Incorrect code. ${5 - (user.otpAttempts + 1)} attempt(s) left.` })
    }

    // ✅ OTP correct
    await User.updateOne(
      { _id: user._id },
      {
        $unset: { otpHash: 1, otpExpiry: 1, otpPurpose: 1 },
        $set:   { otpAttempts: 0, isVerified: true, ...(deviceId ? { deviceId } : {}) },
      }
    )

    console.log(`✅ OTP verified for ${email}`)
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
    if (!email || !purpose)
      return res.status(400).json({ message: 'Email and purpose are required' })

    const user = await User.findOne({ email: email.toLowerCase() })
    if (!user) return res.status(404).json({ message: 'No account found with this email' })

    const otp = generateOtp()
    await User.updateOne(
      { _id: user._id },
      { $set: { otpHash: await bcrypt.hash(otp, 10), otpExpiry: new Date(Date.now() + 10 * 60 * 1000), otpPurpose: purpose, otpAttempts: 0 } }
    )
    await sendOtpEmail(user.email, user.name, otp, purpose)
    res.json({ message: 'A new code has been sent to your email.' })
  } catch (err) {
    console.error('Resend OTP error:', err)
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

module.exports = router