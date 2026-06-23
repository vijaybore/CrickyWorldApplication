//server.js
require('dotenv').config()
const express  = require('express')
const mongoose = require('mongoose')
const cors     = require('cors')

const authRoutes    = require('./routes/auth')
const matchRoutes   = require('./routes/matches')
const playerRoutes  = require('./routes/players')

const app  = express()
const PORT = process.env.PORT || 5000

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(cors())
app.use(express.json({ limit: '6mb' }))

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.json({ status: 'CrickyWorld API is running 🏏', time: new Date().toISOString() })
})

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/api/auth',    authRoutes)
app.use('/api/matches', matchRoutes)
app.use('/api/players', playerRoutes)

// ── 404 handler ───────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ message: `Route ${req.method} ${req.path} not found` })
})

// ── Global error handler ──────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err)
  res.status(500).json({ message: 'Internal server error' })
})

// ── Connect to MongoDB then start server ──────────────────────────────────────
mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI)
  .then(() => {
    console.log('✅ MongoDB connected')
    app.listen(PORT, () => {
      console.log(`🚀 CrickyWorld server running on port ${PORT}`)
       // ADD THIS ↓
  const SERVER_URL = process.env.SERVER_URL || 'https://crickyworld-appserver.onrender.com'
  setInterval(() => {
    fetch(`${SERVER_URL}/`)
      .then(() => console.log('✅ Keep-alive ping sent'))
      .catch(err => console.error('❌ Keep-alive failed:', err.message))
  }, 14 * 60 * 1000)
  // ADD THIS ↑

      // ── Keep-alive ping (prevents Render free tier from sleeping) ───────────
      // Render free instances sleep after 15 min of inactivity, causing the
      // next request to wait 50+ seconds to wake up — long enough for an OTP
      // to expire before verify-otp even runs. Pinging every 14 min keeps the
      // instance awake so OTP verification always succeeds instantly.
      const SERVER_URL = process.env.SERVER_URL || 'https://crickyworld-appserver.onrender.com'
      setInterval(() => {
        fetch(`${SERVER_URL}/`)
          .then(() => console.log('✅ Keep-alive ping sent'))
          .catch(err => console.error('❌ Keep-alive failed:', err.message))
      }, 14 * 60 * 1000) // every 14 minutes
    })
  })
  .catch(err => {
    console.error('❌ MongoDB connection failed:', err.message)
    process.exit(1)
  })