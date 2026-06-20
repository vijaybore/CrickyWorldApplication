//crickyworld-server/routes/players.js
const express = require('express')
const router  = express.Router()
const Player  = require('../models/Player')
const Match   = require('../models/Match')
const jwt     = require('jsonwebtoken')
const { buildCareerMap, getTotalsForName } = require('../utils/playerStats')

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

function ownerQuery(req) {
  return req.user.type === 'user' ? { createdBy: req.user.id } : { deviceId: req.user.id }
}

// ── GET /api/players ──────────────────────────────────────────────────────────
router.get('/', flexAuth, async (req, res) => {
  try {
    const players = await Player.find(ownerQuery(req)).sort({ name: 1 })
    res.json(players)
  } catch (err) {
    res.status(500).json({ message: 'Server error' })
  }
})

// ── GET /api/players/:id ──────────────────────────────────────────────────────
// FIX: the guest branch here previously queried only { _id: req.params.id },
// with no deviceId filter at all — meaning any guest who knew (or guessed) a
// player's Mongo _id could fetch a player that belonged to a different
// device. Now uses ownerQuery(req) consistently for both user and guest.
router.get('/:id', flexAuth, async (req, res) => {
  try {
    const player = await Player.findOne({ _id: req.params.id, ...ownerQuery(req) })
    if (!player) return res.status(404).json({ message: 'Player not found' })
    res.json(player)
  } catch (err) {
    res.status(500).json({ message: 'Server error' })
  }
})

// ── POST /api/players ─────────────────────────────────────────────────────────
router.post('/', flexAuth, async (req, res) => {
  try {
    const playerData = { ...req.body, ...ownerQuery(req) }
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
    const player = await Player.findOneAndUpdate(
      { _id: req.params.id, ...ownerQuery(req) },
      { ...req.body },
      { new: true, runValidators: true }
    )
    if (!player) return res.status(404).json({ message: 'Player not found' })
    res.json(player)
  } catch (err) {
    res.status(500).json({ message: 'Server error' })
  }
})

// ── POST /api/players/:id/sync ────────────────────────────────────────────────
// Recomputes this player's career totals (batting, bowling, fielding) from
// every match this account owns, and persists them. This route previously
// didn't exist at all on this server — every "Sync" button tap in the app
// was hitting the global 404 handler. Also the reason totals were never
// auto-updated after scoring: routes/matches.js had no equivalent call
// either (see the per-ball sync added there in this same fix).
router.post('/:id/sync', flexAuth, async (req, res) => {
  try {
    const player = await Player.findOne({ _id: req.params.id, ...ownerQuery(req) })
    if (!player) return res.status(404).json({ message: 'Player not found' })

    const matches = await Match.find(ownerQuery(req))
    const map = buildCareerMap(matches)
    const totals = getTotalsForName(map, player.name)

    Object.assign(player, totals)
    await player.save()
    res.json(player)
  } catch (err) {
    console.error('POST /players/:id/sync error:', err)
    res.status(500).json({ message: 'Server error' })
  }
})

// ── DELETE /api/players/:id ───────────────────────────────────────────────────
// FIX: same missing-deviceId-filter issue as GET /:id above — previously any
// guest could delete any other guest's player by id.
router.delete('/:id', flexAuth, async (req, res) => {
  try {
    const player = await Player.findOneAndDelete({ _id: req.params.id, ...ownerQuery(req) })
    if (!player) return res.status(404).json({ message: 'Player not found' })
    res.json({ message: 'Player deleted' })
  } catch (err) {
    res.status(500).json({ message: 'Server error' })
  }
})

module.exports = router