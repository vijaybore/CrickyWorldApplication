const express = require('express')
const router  = express.Router()
const Match   = require('../models/Match')
const jwt     = require('jsonwebtoken')

// Flexible auth — works for both logged-in users and guests with deviceId
function flexAuth(req, res, next) {
  const header = req.headers.authorization
  if (header && header.startsWith('Bearer ')) {
    try {
      const payload = jwt.verify(header.split(' ')[1], process.env.JWT_SECRET)
      req.user = { id: payload.id, type: 'user' }
      return next()
    } catch {}
  }
  // Check deviceId from body (POST/PUT) or query (GET)
  const deviceId = req.body?.deviceId || req.query?.deviceId
  if (deviceId) {
    req.user = { id: deviceId, type: 'guest' }
    return next()
  }
  return res.status(401).json({ message: 'No token provided' })
}

// ── GET /api/matches ──────────────────────────────────────────────────────────
router.get('/', flexAuth, async (req, res) => {
  try {
    const query = req.user.type === 'user'
      ? { createdBy: req.user.id }
      : { deviceId: req.user.id }
    const matches = await Match.find(query).sort({ createdAt: -1 })
    res.json(matches)
  } catch (err) {
    console.error('GET /matches error:', err)
    res.status(500).json({ message: 'Server error' })
  }
})

// ── GET /api/matches/:id ──────────────────────────────────────────────────────
router.get('/:id', flexAuth, async (req, res) => {
  try {
    const query = req.user.type === 'user'
      ? { _id: req.params.id, createdBy: req.user.id }
      : { _id: req.params.id }
    const match = await Match.findOne(query)
    if (!match) return res.status(404).json({ message: 'Match not found' })
    res.json(match)
  } catch (err) {
    res.status(500).json({ message: 'Server error' })
  }
})

// ── POST /api/matches ─────────────────────────────────────────────────────────
router.post('/', flexAuth, async (req, res) => {
  try {
    const matchData = { ...req.body }
    if (req.user.type === 'user') {
      matchData.createdBy = req.user.id
    } else {
      matchData.deviceId = req.user.id
    }
    const match = new Match(matchData)
    await match.save()
    res.status(201).json(match)
  } catch (err) {
    console.error('POST /matches error:', err)
    res.status(500).json({ message: 'Server error' })
  }
})

// ── PUT /api/matches/:id ──────────────────────────────────────────────────────
router.put('/:id', flexAuth, async (req, res) => {
  try {
    const query = req.user.type === 'user'
      ? { _id: req.params.id, createdBy: req.user.id }
      : { _id: req.params.id }
    const match = await Match.findOneAndUpdate(
      query,
      { ...req.body },
      { new: true, runValidators: true }
    )
    if (!match) return res.status(404).json({ message: 'Match not found' })
    res.json(match)
  } catch (err) {
    console.error('PUT /matches/:id error:', err)
    res.status(500).json({ message: 'Server error' })
  }
})

// ── DELETE /api/matches/:id ───────────────────────────────────────────────────
router.delete('/:id', flexAuth, async (req, res) => {
  try {
    const query = req.user.type === 'user'
      ? { _id: req.params.id, createdBy: req.user.id }
      : { _id: req.params.id }
    const match = await Match.findOneAndDelete(query)
    if (!match) return res.status(404).json({ message: 'Match not found' })
    res.json({ message: 'Match deleted' })
  } catch (err) {
    res.status(500).json({ message: 'Server error' })
  }
})

module.exports = router