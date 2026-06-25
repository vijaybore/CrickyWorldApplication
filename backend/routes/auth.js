// crickyworld-server/routes/auth.js
const express  = require('express')
const router   = express.Router()
const jwt      = require('jsonwebtoken')
const bcrypt   = require('bcryptjs')
const crypto   = require('crypto')
const rateLimit = require('express-rate-limit')
const User     = require('../models/User')

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const GMAIL_SEND_URL   = 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send'

// ── Rate limiters ──────────────────────────────────────────────────────────────
// Keyed by IP. Tune windowMs/max if shared NAT (campus wifi, office proxy)
// produces false positives for legitimate users.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many login attempts. Please try again in a few minutes.' },
})
const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 8,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many accounts created from this network. Please try again later.' },
})
const forgotPasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many reset requests. Please try again in a few minutes.' },
})
const resendLinkLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 6,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many resend requests. Please wait a bit before trying again.' },
})

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
  const errors = []

  // Try Brevo SMTP if configured
  if (process.env.BREVO_API_KEY) {
    try {
      console.log('Attempting to send email via Brevo SMTP...')
      const nodemailer = require('nodemailer')
      const transporter = nodemailer.createTransport({
        host: 'smtp-relay.brevo.com',
        port: 587,
        auth: {
          user: process.env.MAIL_FROM_EMAIL || 'vijaybore05@gmail.com',
          pass: process.env.BREVO_API_KEY,
        },
      })
      const fromName = process.env.MAIL_FROM_NAME || 'CrickyWorld'
      const fromEmail = process.env.MAIL_FROM_EMAIL || 'vijaybore05@gmail.com'
      await transporter.sendMail({
        from: `"${fromName}" <${fromEmail}>`,
        to,
        subject,
        html,
      })
      console.log(`Email sent via Brevo SMTP to ${to}: ${subject}`)
      return
    } catch (err) {
      errors.push(`Brevo SMTP: ${err.message}`)
      console.error('Failed to send email via Brevo SMTP, falling back...', err.message)
    }
  }

  // Try Resend if configured
  if (process.env.RESEND_API_KEY) {
    try {
      console.log('Attempting to send email via Resend...')
      const { Resend } = require('resend')
      const resend = new Resend(process.env.RESEND_API_KEY)
      const fromEmail = process.env.FROM_EMAIL || 'onboarding@resend.dev'
      const { data, error } = await resend.emails.send({
        from: `CrickyWorld <${fromEmail}>`,
        to,
        subject,
        html,
      })
      if (error) {
        // Resend's SDK returns errors in `error`, not always as a thrown
        // exception. The most common one on a free/unverified account:
        // onboarding@resend.dev can only send to the Resend account's own
        // email — every other recipient gets rejected here.
        const isSandboxRestriction = fromEmail === 'onboarding@resend.dev'
          && /own email|verified domain|recipients other than/i.test(error.message || '')
        if (isSandboxRestriction) {
          console.error(
            `Resend rejected ${to}: sending from onboarding@resend.dev only works for the email address tied to your Resend account. ` +
            `Verify a domain at resend.com/domains and set FROM_EMAIL to an address on it, or rely on the Gmail fallback below.`
          )
        } else {
          console.error('Resend returned an error:', JSON.stringify(error))
        }
        throw new Error(error.message || 'Resend send failed')
      }
      console.log(`Email sent via Resend to ${to}: ${subject}`, data)
      return
    } catch (err) {
      errors.push(`Resend: ${err.message}`)
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
      errors.push(`Nodemailer SMTP: ${err.message}`)
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
    errors.push(`Gmail API OAuth: ${err.message}`)
    console.error(`Failed to send email to ${to}:`, err.message)
    // All providers exhausted — surface every attempt's failure reason so
    // logs show exactly why, instead of just the last one.
    throw new Error(`All email providers failed for ${to}. ${errors.join(' | ')}`)
  }
}

function signToken(userId) {
  // Kept at 90d for backward compatibility with any already-issued tokens,
  // but new logins should prefer the short-lived access + refresh pair via
  // issueTokenPair() below.
  return jwt.sign({ id: userId }, process.env.JWT_SECRET, { expiresIn: '90d' })
}

function generateRefreshToken() {
  return crypto.randomBytes(40).toString('hex')
}

function hashRefreshToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex')
}

// Issues an access token + refresh token pair and persists the hashed
// refresh token. The frontend stores both and uses the refresh token to
// silently re-mint access tokens via POST /refresh-token.
async function issueTokenPair(user) {
  const accessToken  = signToken(user._id)
  const refreshToken = generateRefreshToken()
  user.refreshTokenHash   = hashRefreshToken(refreshToken)
  user.refreshTokenExpiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days
  await user.save()
  return { accessToken, refreshToken }
}

function generateLoginToken() {
  return crypto.randomBytes(32).toString('hex')
}

function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString()
}

async function sendVerifyLinkEmail(email, name, token, otp, purpose, serverUrl) {
  const isLogin   = purpose === 'login'
  const subject   = isLogin ? "Confirm it's you on CrickyWorld" : 'Verify your CrickyWorld account'
  const heading   = isLogin ? `Confirm it's you, ${name}!` : `Hey ${name}!`
  const intro     = isLogin
    ? 'Use the 6-digit OTP code below to sign in, or tap the button below on this device.'
    : 'Thanks for joining CrickyWorld! Use the 6-digit OTP code below to verify your email, or tap the button below.'
  const baseUrl    = serverUrl || process.env.SERVER_URL || 'https://crickyworld-appserver.onrender.com'
  const confirmUrl = `${baseUrl}/api/auth/confirm-link/${token}`

  console.log(`Building verify link and OTP for ${email}: ${confirmUrl} (OTP: ${otp})`)

  const html = `
    <div style="font-family:sans-serif;max-width:480px;margin:auto;background:#0a0a0a;color:#f0f0f0;border-radius:16px;overflow:hidden">
      <div style="background:#cc0000;padding:24px;text-align:center">
        <h1 style="margin:0;font-size:28px">CrickyWorld</h1>
        <p style="margin:4px 0 0;opacity:0.8;font-size:13px">SCORE TRACK WIN</p>
      </div>
      <div style="padding:32px">
        <h2 style="color:#ff4444;margin-top:0">${heading}</h2>
        <p style="color:#aaa;line-height:1.6">${intro}</p>
        
        <div style="text-align:center;margin:24px 0">
          <p style="font-size:12px;color:#666;margin:0 0 8px;letter-spacing:1px;text-transform:uppercase">Your 6-Digit OTP</p>
          <span style="font-size:32px;font-weight:bold;letter-spacing:6px;color:#ff4444;background:#161616;padding:12px 24px;border-radius:8px;border:1px solid rgba(255,255,255,0.1);display:inline-block">
            ${otp}
          </span>
        </div>

        <p style="color:#555;font-size:12px;text-align:center">Or click the button below to verify automatically on this device:</p>
        
        <div style="text-align:center;margin:16px 0">
          <a href="${confirmUrl}" style="background:#cc0000;color:#fff;padding:12px 28px;border-radius:10px;text-decoration:none;font-weight:700;font-size:14px;display:inline-block">
            Verify Automatically
          </a>
        </div>
        <p style="color:#555;font-size:12px;text-align:center">This code and link expire in 10 minutes. Never share them with anyone.</p>
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
router.post('/register', registerLimiter, async (req, res) => {
  try {
    const { name, email, password, deviceId } = req.body
    if (!name || !email || !password)
      return res.status(400).json({ message: 'Name, email and password are required' })

    const existing = await User.findOne({ email: email.toLowerCase() })
    if (existing)
      return res.status(409).json({ message: 'An account with this email already exists' })

    if (deviceId) {
      await User.updateMany({ deviceId }, { $unset: { deviceId: 1 } })
    }

    const hash  = await bcrypt.hash(password, 12)
    const token = generateLoginToken()
    const otp   = generateOTP()

    const user = await User.create({
      name,
      email:               email.toLowerCase(),
      password:            hash,
      ...(deviceId ? { deviceId } : {}),
      isVerified:          false,
      loginToken:          token,
      loginOtp:            otp,
      loginTokenExpiry:    new Date(Date.now() + 10 * 60 * 1000),
      loginTokenPurpose:   'register',
      loginTokenConfirmed: false,
    })

    console.log(`New user registered: ${user.email}, sending verify link...`)
    const serverUrl = process.env.SERVER_URL || `${req.protocol}://${req.get('host')}`

    // The account is already created at this point. If the verify email
    // fails to send (provider outage, bad credentials, etc.) we must NOT
    // return 500 — that tells the client "nothing happened" when in fact
    // the user now exists, so retrying would just hit the 409 duplicate
    // check above. Instead, report success and let "Resend Email Link" on
    // the waiting screen retry the send.
    let emailSent = true
    try {
      await sendVerifyLinkEmail(user.email, user.name, token, otp, 'register', serverUrl)
    } catch (emailErr) {
      emailSent = false
      console.error(`[register] account created for ${user.email} but verify email failed to send:`, emailErr.message)
    }

    res.status(201).json({
      message:        emailSent
        ? 'Account created! Check your email and enter the OTP or tap the verify link to activate it.'
        : 'Account created! We had trouble sending the verification email — tap "Resend Email Link" to try again.',
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
router.post('/login', loginLimiter, async (req, res) => {
  try {
    const { email, password, deviceId } = req.body
    if (!email || !password)
      return res.status(400).json({ message: 'Email and password are required' })

    // FIX 1: select loginToken + loginTokenExpiry so the double-submit guard
    // can actually read them (both have select:false in the User schema).
    const user = await User.findOne({ email: email.toLowerCase() })
      .select('+password +loginToken +loginTokenExpiry +loginOtp')
    if (!user) return res.status(401).json({ message: 'No account found with this email' })

    const match = await bcrypt.compare(password, user.password)
    if (!match) return res.status(401).json({ message: 'Incorrect password' })

    // If the user's email is already verified, log in directly without OTP
    if (user.isVerified) {
      console.log(`[login] verified user ${user.email} logged in directly`)
      if (deviceId) {
        await User.updateMany({ deviceId }, { $unset: { deviceId: 1 } })
        user.deviceId = String(deviceId)
      }
      
      // Clear old login tokens if any
      user.loginToken          = undefined
      user.loginOtp            = undefined
      user.loginTokenExpiry    = undefined
      user.loginTokenPurpose   = undefined
      user.loginTokenConfirmed = false
      
      const { accessToken, refreshToken } = await issueTokenPair(user)
      return res.json({
        verifyRequired: false,
        token:          accessToken,
        refreshToken,
        user:           { _id: user._id, name: user.name, email: user.email },
      })
    }

    // Otherwise, generate OTP and require verification
    const purpose = 'register'
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
        message:        'Please verify your email first. We sent you a new verify link/OTP.',
        verifyRequired: true,
        purpose,
        email:          user.email,
        loginToken:     user.loginToken,
      })
    }

    const token = generateLoginToken()
    const otp   = generateOTP()
    user.loginToken          = token
    user.loginOtp            = otp
    user.loginTokenExpiry    = new Date(now + 10 * 60 * 1000)
    user.loginTokenPurpose   = purpose
    user.loginTokenConfirmed = false
    await user.save()

    console.log(`[login] new token for ${user.email}, purpose=${purpose}, token=${token.slice(0, 8)}..., OTP=${otp}`)
    const serverUrl = process.env.SERVER_URL || `${req.protocol}://${req.get('host')}`

    let emailSent = true
    try {
      await sendVerifyLinkEmail(user.email, user.name, token, otp, purpose, serverUrl)
      console.log(`[login] email sent to ${user.email}`)
    } catch (emailErr) {
      emailSent = false
      console.error(`[login] token saved for ${user.email} but verify email failed to send:`, emailErr.message)
    }

    res.json({
      message:        emailSent
        ? 'Please verify your email first. We sent you a new verify link/OTP.'
        : 'We had trouble sending the email — tap "Resend Email Link" to try again.',
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

    user.isVerified = true
    if (deviceId) {
      await User.updateMany({ deviceId }, { $unset: { deviceId: 1 } })
      user.deviceId = String(deviceId)
    }
    user.loginToken          = undefined
    user.loginTokenExpiry    = undefined
    user.loginTokenPurpose   = undefined
    user.loginTokenConfirmed = false
    await user.save()

    console.log(`[login-status] confirmed for ${user.email}, issuing token pair`)
    const { accessToken, refreshToken } = await issueTokenPair(user)
    res.json({
      confirmed:    true,
      token:        accessToken,
      refreshToken,
      user:         { _id: user._id, name: user.name, email: user.email },
    })
  } catch (err) {
    console.error('Login status error:', err)
    res.status(500).json({ message: 'Server error' })
  }
})

// ── POST /api/auth/verify-otp ────────────────────────────────────────────────
router.post('/verify-otp', async (req, res) => {
  try {
    const { email, otp, deviceId } = req.body
    if (!email || !otp)
      return res.status(400).json({ message: 'Email and OTP are required' })

    const user = await User.findOne({ email: email.toLowerCase() })
      .select('+loginOtp +loginTokenExpiry +loginTokenPurpose')

    if (!user || !user.loginOtp) {
      return res.status(400).json({ message: 'Invalid OTP or no verification pending' })
    }

    if (!user.loginTokenExpiry || user.loginTokenExpiry < new Date()) {
      return res.status(400).json({ message: 'OTP has expired. Please request a new one.' })
    }

    if (user.loginOtp !== otp) {
      return res.status(400).json({ message: 'Incorrect OTP code. Please check your email.' })
    }

    user.isVerified = true
    if (deviceId) {
      await User.updateMany({ deviceId }, { $unset: { deviceId: 1 } })
      user.deviceId = String(deviceId)
    }

    // Clear verification fields
    user.loginToken          = undefined
    user.loginTokenExpiry    = undefined
    user.loginTokenPurpose   = undefined
    user.loginTokenConfirmed = false
    user.loginOtp            = undefined
    await user.save()

    console.log(`[verify-otp] OTP verified for ${user.email}, issuing token pair`)
    const { accessToken, refreshToken } = await issueTokenPair(user)
    res.json({
      confirmed:    true,
      token:        accessToken,
      refreshToken,
      user:         { _id: user._id, name: user.name, email: user.email },
    })
  } catch (err) {
    console.error('Verify OTP error:', err)
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
router.post('/resend-link', resendLinkLimiter, async (req, res) => {
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
    const otp   = generateOTP()
    user.loginToken          = token
    user.loginOtp            = otp
    user.loginTokenExpiry    = new Date(Date.now() + 10 * 60 * 1000)
    user.loginTokenPurpose   = purpose
    user.loginTokenConfirmed = false
    await user.save()

    console.log(`[resend-link] sending to ${user.email}, purpose=${purpose}, OTP=${otp}`)
    const serverUrl = process.env.SERVER_URL || `${req.protocol}://${req.get('host')}`

    let emailSent = true
    try {
      await sendVerifyLinkEmail(user.email, user.name, token, otp, purpose, serverUrl)
    } catch (emailErr) {
      emailSent = false
      console.error(`[resend-link] token saved for ${user.email} but email failed to send:`, emailErr.message)
    }

    res.json({
      message: emailSent
        ? 'A new OTP and link has been sent to your email.'
        : 'We had trouble sending the email. Please try again in a moment.',
      loginToken: token,
    })
  } catch (err) {
    console.error('Resend link error:', err)
    res.status(500).json({ message: 'Server error' })
  }
})

// ── POST /api/auth/forgot-password ───────────────────────────────────────────
router.post('/forgot-password', forgotPasswordLimiter, async (req, res) => {
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

    // The reset token is already saved at this point — a failed email send
    // shouldn't surface as a 500 (which reads as "something is broken")
    // when the real, user-actionable problem is just delivery. We still
    // return the generic message either way so this endpoint can't be used
    // to enumerate which emails have accounts.
    try {
      await sendResetEmail(email.toLowerCase(), user.name, resetToken, serverUrl)
    } catch (emailErr) {
      console.error(`[forgot-password] reset token saved for ${user.email} but email failed to send:`, emailErr.message)
    }

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
    const { accessToken, refreshToken } = await issueTokenPair(user)
    res.json({ token: accessToken, refreshToken, user: { _id: user._id, name: user.name, email: user.email } })
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

// ── POST /api/auth/refresh-token ─────────────────────────────────────────────
// Exchanges a valid refresh token for a new access token.
router.post('/refresh-token', async (req, res) => {
  try {
    const { refreshToken } = req.body
    if (!refreshToken) return res.status(400).json({ message: 'refreshToken required' })

    const hash = hashRefreshToken(refreshToken)
    const user = await User.findOne({ refreshTokenHash: hash }).select('+refreshTokenHash')
    if (!user) return res.status(401).json({ message: 'Invalid refresh token' })

    if (!user.refreshTokenExpiry || user.refreshTokenExpiry < new Date()) {
      return res.status(401).json({ message: 'Refresh token expired. Please log in again.' })
    }

    const accessToken = signToken(user._id)
    res.json({ token: accessToken, user: { _id: user._id, name: user.name, email: user.email } })
  } catch (err) {
    console.error('Refresh token error:', err)
    res.status(500).json({ message: 'Server error' })
  }
})

// ── POST /api/auth/logout ────────────────────────────────────────────────────
// Revokes the refresh token server-side so it can't be replayed after logout.
router.post('/logout', async (req, res) => {
  try {
    const { refreshToken } = req.body
    if (refreshToken) {
      const hash = hashRefreshToken(refreshToken)
      await User.updateOne(
        { refreshTokenHash: hash },
        { $unset: { refreshTokenHash: 1, refreshTokenExpiry: 1 } }
      )
    }
    res.json({ message: 'Logged out successfully' })
  } catch (err) {
    console.error('Logout error:', err)
    // Logout should never block the client from clearing local state.
    res.json({ message: 'Logged out' })
  }
})

module.exports = router