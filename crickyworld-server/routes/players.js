const express = require('express')
const router  = express.Router()
const Player  = require('../models/Player')
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
  const deviceId = req.body?.deviceId || req.query?.deviceId
  if (deviceId) {
    req.user = { id: deviceId, type: 'guest' }
    return next()
  }
  return res.status(401).json({ message: 'No token provided' })
}

// ── GET /api/players ──────────────────────────────────────────────────────────
router.get('/', flexAuth, async (req, res) => {
  try {
    const query = req.user.type === 'user'
      ? { createdBy: req.user.id }
      : { deviceId: req.user.id }
    const players = await Player.find(query).sort({ name: 1 })
    res.json(players)
  } catch (err) {
    res.status(500).json({ message: 'Server error' })
  }
})

// ── GET /api/players/:id ──────────────────────────────────────────────────────
router.get('/:id', flexAuth, async (req, res) => {
  try {
    const query = req.user.type === 'user'
      ? { _id: req.params.id, createdBy: req.user.id }
      : { _id: req.params.id }
    const player = await Player.findOne(query)
    if (!player) return res.status(404).json({ message: 'Player not found' })
    res.json(player)
  } catch (err) {
    res.status(500).json({ message: 'Server error' })
  }
})

// ── POST /api/players ─────────────────────────────────────────────────────────
router.post('/', flexAuth, async (req, res) => {
  try {
    const playerData = { ...req.body }
    if (req.user.type === 'user') {
      playerData.createdBy = req.user.id
    } else {
      playerData.deviceId = req.user.id
    }
    const player = new Player(playerData)
    await player.save()
    res.status(201).json(player)
  } catch (err) {
    console.error('POST /players error:', err)
    res.status(500).json({ message: 'Server error' })
  }
})

// ── PUT /api/players/:id ──────────────────────────────────────────────────────
router.put('/:id', flexAuth, async (req, res) => {
  try {
    const query = req.user.type === 'user'
      ? { _id: req.params.id, createdBy: req.user.id }
      : { _id: req.params.id }
    const player = await Player.findOneAndUpdate(
      query,
      { ...req.body },
      { new: true, runValidators: true }
    )
    if (!player) return res.status(404).json({ message: 'Player not found' })
    res.json(player)
  } catch (err) {
    res.status(500).json({ message: 'Server error' })
  }
})

// ── DELETE /api/players/:id ───────────────────────────────────────────────────
router.delete('/:id', flexAuth, async (req, res) => {
  try {
    const query = req.user.type === 'user'
      ? { _id: req.params.id, createdBy: req.user.id }
      : { _id: req.params.id }
    const player = await Player.findOneAndDelete(query)
    if (!player) return res.status(404).json({ message: 'Player not found' })
    res.json({ message: 'Player deleted' })
  } catch (err) {
    res.status(500).json({ message: 'Server error' })
  }
})

module.exports = router