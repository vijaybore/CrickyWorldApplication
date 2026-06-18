const express = require('express')
const router  = express.Router()
const Player  = require('../models/Player')
const Match   = require('../models/Match')
const auth    = require('../middleware/auth')

// All routes require auth — every query is scoped to req.user.id

// ── GET /api/players ──────────────────────────────────────────────────────────
router.get('/', auth, async (req, res) => {
  try {
    const players = await Player.find({ createdBy: req.user.id }).sort({ name: 1 })
    res.json(players)
  } catch (err) {
    res.status(500).json({ message: 'Server error' })
  }
})

// ── GET /api/players/:id ──────────────────────────────────────────────────────
router.get('/:id', auth, async (req, res) => {
  try {
    const player = await Player.findOne({ _id: req.params.id, createdBy: req.user.id })
    if (!player) return res.status(404).json({ message: 'Player not found' })
    res.json(player)
  } catch (err) {
    res.status(500).json({ message: 'Server error' })
  }
})

// ── POST /api/players ─────────────────────────────────────────────────────────
router.post('/', auth, async (req, res) => {
  try {
    const player = new Player({ ...req.body, createdBy: req.user.id })
    await player.save()
    res.status(201).json(player)
  } catch (err) {
    console.error('POST /players error:', err)
    res.status(500).json({ message: 'Server error' })
  }
})

// ── POST /api/players/:id/sync ────────────────────────────────────────────────
// Recompute career totals for a player from all completed matches owned by user
router.post('/:id/sync', auth, async (req, res) => {
  try {
    const player = await Player.findOne({ _id: req.params.id, createdBy: req.user.id })
    if (!player) return res.status(404).json({ message: 'Player not found' })

    const matches = await Match.find({ createdBy: req.user.id, isCompleted: true })

    const totals = {
      totalMatches: 0, totalRuns: 0, totalBallsFaced: 0, totalFours: 0, totalSixes: 0,
      totalWickets: 0, totalBallsBowled: 0, totalRunsConceded: 0, highestScore: 0,
      timesOut: 0, totalFifties: 0, totalHundreds: 0, totalDotBalls: 0, totalWides: 0,
      fiveWickets: 0, bestBowlingW: 0, bestBowlingR: 999,
    }
    const matchIds = new Set()
    let highestNotOut = false

    matches.forEach(m => {
      ;[m.innings1, m.innings2].forEach(inn => {
        if (!inn) return
        ;(inn.battingStats || []).forEach(b => {
          if (b.name !== player.name) return
          matchIds.add(String(m._id))
          const runs = b.runs || 0
          totals.totalRuns += runs
          totals.totalBallsFaced += b.balls || 0
          totals.totalFours += b.fours || 0
          totals.totalSixes += b.sixes || 0
          if (runs > totals.highestScore || (runs === totals.highestScore && !b.isOut)) {
            totals.highestScore = runs
            highestNotOut = !b.isOut
          }
          if (b.isOut) totals.timesOut += 1
          if (runs >= 100) totals.totalHundreds += 1
          else if (runs >= 50) totals.totalFifties += 1
        })
        ;(inn.bowlingStats || []).forEach(bw => {
          if (bw.name !== player.name) return
          matchIds.add(String(m._id))
          const wkts = bw.wickets || 0
          const runs = bw.runs || 0
          totals.totalWickets += wkts
          totals.totalBallsBowled += bw.balls || 0
          totals.totalRunsConceded += runs
          totals.totalWides += bw.wides || 0
          if (wkts >= 5) totals.fiveWickets += 1
          if (wkts > totals.bestBowlingW || (wkts === totals.bestBowlingW && runs < totals.bestBowlingR && wkts > 0)) {
            totals.bestBowlingW = wkts
            totals.bestBowlingR = runs
          }
        })
      })
    })

    totals.totalMatches = matchIds.size
    if (totals.bestBowlingW === 0) totals.bestBowlingR = 0

    Object.assign(player, totals)
    await player.save()
    res.json(player)
  } catch (err) {
    console.error('POST /players/:id/sync error:', err)
    res.status(500).json({ message: 'Server error' })
  }
})

// ── PUT /api/players/:id ──────────────────────────────────────────────────────
router.put('/:id', auth, async (req, res) => {
  try {
    const player = await Player.findOneAndUpdate(
      { _id: req.params.id, createdBy: req.user.id },
      { ...req.body, createdBy: req.user.id },
      { new: true, runValidators: true }
    )
    if (!player) return res.status(404).json({ message: 'Player not found' })
    res.json(player)
  } catch (err) {
    res.status(500).json({ message: 'Server error' })
  }
})

// ── DELETE /api/players/:id ───────────────────────────────────────────────────
router.delete('/:id', auth, async (req, res) => {
  try {
    const player = await Player.findOneAndDelete({ _id: req.params.id, createdBy: req.user.id })
    if (!player) return res.status(404).json({ message: 'Player not found' })
    res.json({ message: 'Player deleted' })
  } catch (err) {
    res.status(500).json({ message: 'Server error' })
  }
})

module.exports = router