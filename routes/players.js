const express = require('express')
const router  = express.Router()
const Player  = require('../models/Player')
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
